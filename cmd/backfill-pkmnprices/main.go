package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	providerName           = "PkmnPrices"
	defaultBaseURL         = "https://api.pkmnprices.com/v1"
	defaultDailyBudget     = 80
	maximumDailyBudget     = 80
	defaultRequestDelay    = 1250 * time.Millisecond
	minimumRequestDelay    = 1250 * time.Millisecond
	historyPageSize        = 40
	historyPeriod          = "365d"
	historyCurrency        = "usd"
	historyPrinting        = "1st Edition Holofoil"
	maximumResponseBytes   = 4 << 20
	maximumRequestAttempts = 3
)

var errRateLimited = errors.New("PkmnPrices rate limit reached")

type backfillTarget struct {
	Key                string
	SortOrder          int
	ProviderCardID     int64
	TCGPlayerProductID int64
	VariantID          string
	Condition          string
	Printing           string
	NextPage           int
}

type historyPoint struct {
	Date      string   `json:"date"`
	Source    string   `json:"source"`
	Currency  string   `json:"currency"`
	Condition string   `json:"condition"`
	Variant   string   `json:"variant"`
	Average   *float64 `json:"avg"`
	Low       *float64 `json:"low"`
	High      *float64 `json:"high"`
	SaleCount *int     `json:"sale_count"`
}

type historyResponse struct {
	Data       []historyPoint `json:"data"`
	Pagination struct {
		Page       int `json:"page"`
		PerPage    int `json:"per_page"`
		Total      int `json:"total"`
		TotalPages int `json:"total_pages"`
	} `json:"pagination"`
}

type historyResult struct {
	Response       historyResponse
	CreditsCharged int
	CreditLimit    int
	RateRemaining  int
}

type pkmnPricesClient struct {
	apiKey      string
	baseURL     string
	httpClient  *http.Client
	delay       time.Duration
	lastRequest time.Time
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("PkmnPrices backfill failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	statusOnly := flag.Bool("status", false, "show progress without making an API request")
	flag.Parse()

	apiKey := strings.TrimSpace(os.Getenv("PKMNPRICES_API_KEY"))
	if apiKey == "" {
		return errors.New("PKMNPRICES_API_KEY must be set")
	}
	baseURL := strings.TrimRight(valueOrDefault("PKMNPRICES_BASE_URL", defaultBaseURL), "/")
	delay, err := durationFromMilliseconds("PKMNPRICES_REQUEST_INTERVAL_MS", defaultRequestDelay)
	if err != nil {
		return err
	}
	if delay < minimumRequestDelay {
		return fmt.Errorf("PKMNPRICES_REQUEST_INTERVAL_MS must be at least %d", minimumRequestDelay.Milliseconds())
	}
	dailyBudget, err := positiveInteger("PKMNPRICES_DAILY_CREDIT_BUDGET", defaultDailyBudget)
	if err != nil {
		return err
	}
	if dailyBudget > maximumDailyBudget {
		return fmt.Errorf("PKMNPRICES_DAILY_CREDIT_BUDGET must not exceed %d", maximumDailyBudget)
	}

	appConfig, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.Open(ctx, appConfig.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := initializeProgress(ctx, db, machampTargets()); err != nil {
		return err
	}
	if *statusOnly {
		return logStatus(ctx, logger, db, dailyBudget)
	}
	historyEnabled, err := booleanEnvironment("PKMNPRICES_HISTORY_ENABLED", false)
	if err != nil {
		return err
	}
	if !historyEnabled {
		return errors.New(
			"PkmnPrices history is disabled because the endpoint requires Pro; " +
				"enable PKMNPRICES_HISTORY_ENABLED only after upgrading the account",
		)
	}

	client := &pkmnPricesClient{
		apiKey:     apiKey,
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		delay:      delay,
	}

	usageDay := time.Now().UTC().Format(time.DateOnly)
	creditsUsed, err := dailyCredits(ctx, db, usageDay)
	if err != nil {
		return err
	}

	for dailyBudget-creditsUsed >= historyPageSize {
		target, err := nextTarget(ctx, db)
		if errors.Is(err, pgx.ErrNoRows) {
			logger.Info("PkmnPrices Machamp backfill is complete")
			return logStatus(ctx, logger, db, dailyBudget)
		}
		if err != nil {
			return err
		}

		result, err := client.history(ctx, target, historyPageSize)
		if errors.Is(err, errRateLimited) {
			logger.Warn("PkmnPrices stopped the run at its rate limit; progress is preserved")
			return nil
		}
		if err != nil {
			return err
		}
		if result.CreditsCharged < 0 || result.CreditsCharged > historyPageSize {
			return fmt.Errorf("unexpected PkmnPrices credit charge: %d", result.CreditsCharged)
		}
		if creditsUsed+result.CreditsCharged > dailyBudget {
			return fmt.Errorf("PkmnPrices response would exceed the daily automation budget")
		}

		imported, completed, err := saveHistoryPage(ctx, db, usageDay, target, result)
		if err != nil {
			return err
		}
		creditsUsed += result.CreditsCharged
		logger.Info(
			"saved PkmnPrices history page",
			"target", target.Key,
			"page", target.NextPage,
			"rows", len(result.Response.Data),
			"inserted", imported,
			"credits_charged", result.CreditsCharged,
			"credits_used_today", creditsUsed,
			"automation_budget", dailyBudget,
			"provider_credit_limit", result.CreditLimit,
			"rate_remaining", result.RateRemaining,
			"completed", completed,
		)
	}

	logger.Info(
		"PkmnPrices daily safety budget reached",
		"credits_used_today", creditsUsed,
		"automation_budget", dailyBudget,
		"provider_limit", 100,
	)
	return logStatus(ctx, logger, db, dailyBudget)
}

func machampTargets() []backfillTarget {
	cards := []struct {
		key                string
		providerCardID     int64
		tcgPlayerProductID int64
	}{
		{key: "shadowless", providerCardID: 32456, tcgPlayerProductID: 107004},
		{key: "later-stamped", providerCardID: 32321, tcgPlayerProductID: 42425},
	}
	conditions := []struct {
		name string
		slug string
	}{
		{name: "Near Mint", slug: "near-mint"},
		{name: "Lightly Played", slug: "lightly-played"},
		{name: "Moderately Played", slug: "moderately-played"},
		{name: "Heavily Played", slug: "heavily-played"},
		{name: "Damaged", slug: "damaged"},
	}

	targets := make([]backfillTarget, 0, len(cards)*len(conditions))
	for cardIndex, card := range cards {
		for conditionIndex, condition := range conditions {
			targets = append(targets, backfillTarget{
				Key:                card.key + ":" + condition.slug,
				SortOrder:          cardIndex*len(conditions) + conditionIndex,
				ProviderCardID:     card.providerCardID,
				TCGPlayerProductID: card.tcgPlayerProductID,
				VariantID: fmt.Sprintf(
					"curated-%d-first-edition-holofoil-%s",
					card.tcgPlayerProductID,
					condition.slug,
				),
				Condition: condition.name,
				Printing:  historyPrinting,
			})
		}
	}
	return targets
}

func initializeProgress(ctx context.Context, db *pgxpool.Pool, targets []backfillTarget) error {
	for _, target := range targets {
		_, err := db.Exec(ctx, `
			INSERT INTO provider_backfill_progress (
				provider, target_key, sort_order, provider_card_id,
				tcgplayer_product_id, variant_id, condition, printing, page_size
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (provider, target_key) DO UPDATE SET
				sort_order = EXCLUDED.sort_order,
				provider_card_id = EXCLUDED.provider_card_id,
				tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
				variant_id = EXCLUDED.variant_id,
				condition = EXCLUDED.condition,
				printing = EXCLUDED.printing,
				page_size = EXCLUDED.page_size,
				updated_at = now()
		`, providerName, target.Key, target.SortOrder, target.ProviderCardID,
			target.TCGPlayerProductID, target.VariantID, target.Condition,
			target.Printing, historyPageSize)
		if err != nil {
			return fmt.Errorf("initialize target %s: %w", target.Key, err)
		}
	}
	return nil
}

func nextTarget(ctx context.Context, db *pgxpool.Pool) (backfillTarget, error) {
	var target backfillTarget
	err := db.QueryRow(ctx, `
		SELECT
			target_key, sort_order, provider_card_id, tcgplayer_product_id,
			variant_id, condition, printing, next_page
		FROM provider_backfill_progress
		WHERE provider = $1 AND NOT completed
		ORDER BY sort_order
		LIMIT 1
	`, providerName).Scan(
		&target.Key,
		&target.SortOrder,
		&target.ProviderCardID,
		&target.TCGPlayerProductID,
		&target.VariantID,
		&target.Condition,
		&target.Printing,
		&target.NextPage,
	)
	if err != nil {
		return backfillTarget{}, err
	}
	return target, nil
}

func dailyCredits(ctx context.Context, db *pgxpool.Pool, usageDay string) (int, error) {
	var credits int
	err := db.QueryRow(ctx, `
		SELECT credits
		FROM provider_api_usage
		WHERE provider = $1 AND usage_on = $2
	`, providerName, usageDay).Scan(&credits)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read PkmnPrices usage: %w", err)
	}
	return credits, nil
}

func saveHistoryPage(
	ctx context.Context,
	db *pgxpool.Pool,
	usageDay string,
	target backfillTarget,
	result historyResult,
) (int, bool, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("begin history import: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO provider_api_usage (provider, usage_on, requests, credits)
		VALUES ($1, $2, 1, $3)
		ON CONFLICT (provider, usage_on) DO UPDATE SET
			requests = provider_api_usage.requests + 1,
			credits = provider_api_usage.credits + EXCLUDED.credits,
			updated_at = now()
	`, providerName, usageDay, result.CreditsCharged); err != nil {
		return 0, false, fmt.Errorf("record PkmnPrices usage: %w", err)
	}

	inserted := 0
	for _, point := range result.Response.Data {
		if err := validateHistoryPoint(target, point); err != nil {
			return 0, false, err
		}
		if point.Average == nil {
			continue
		}
		commandTag, err := tx.Exec(ctx, `
			INSERT INTO price_observations (
				variant_id, observed_on, price, source_provider,
				low_price, high_price, sale_count, imported_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
			ON CONFLICT (variant_id, observed_on) DO NOTHING
		`, target.VariantID, point.Date, *point.Average, providerName,
			point.Low, point.High, point.SaleCount)
		if err != nil {
			return 0, false, fmt.Errorf("insert %s history for %s: %w", point.Date, target.Key, err)
		}
		inserted += int(commandTag.RowsAffected())
	}

	completed := result.Response.Pagination.TotalPages == 0 ||
		target.NextPage >= result.Response.Pagination.TotalPages
	if _, err := tx.Exec(ctx, `
		UPDATE provider_backfill_progress
		SET
			next_page = CASE WHEN $3 THEN next_page ELSE next_page + 1 END,
			completed = $3,
			completed_at = CASE WHEN $3 THEN now() ELSE NULL END,
			updated_at = now()
		WHERE provider = $1 AND target_key = $2
	`, providerName, target.Key, completed); err != nil {
		return 0, false, fmt.Errorf("advance target %s: %w", target.Key, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, false, fmt.Errorf("commit target %s: %w", target.Key, err)
	}
	return inserted, completed, nil
}

func validateHistoryPoint(target backfillTarget, point historyPoint) error {
	if point.Source != "tcgplayer" || point.Currency != "USD" {
		return fmt.Errorf("unexpected source or currency for %s on %s", target.Key, point.Date)
	}
	if point.Condition != target.Condition || point.Variant != target.Printing {
		return fmt.Errorf("unexpected condition or printing for %s on %s", target.Key, point.Date)
	}
	if _, err := time.Parse(time.DateOnly, point.Date); err != nil {
		return fmt.Errorf("invalid date for %s: %q", target.Key, point.Date)
	}
	for _, amount := range []*float64{point.Average, point.Low, point.High} {
		if amount != nil && *amount < 0 {
			return fmt.Errorf("negative price for %s on %s", target.Key, point.Date)
		}
	}
	if point.SaleCount != nil && *point.SaleCount < 0 {
		return fmt.Errorf("negative sale count for %s on %s", target.Key, point.Date)
	}
	return nil
}

func logStatus(ctx context.Context, logger *slog.Logger, db *pgxpool.Pool, dailyBudget int) error {
	usageDay := time.Now().UTC().Format(time.DateOnly)
	credits, err := dailyCredits(ctx, db, usageDay)
	if err != nil {
		return err
	}
	var targets, completed, observations int
	err = db.QueryRow(ctx, `
		SELECT
			count(*)::integer,
			count(*) FILTER (WHERE completed)::integer,
			(
				SELECT count(*)::integer
				FROM price_observations
				WHERE source_provider = $1
			)
		FROM provider_backfill_progress
		WHERE provider = $1
	`, providerName).Scan(&targets, &completed, &observations)
	if err != nil {
		return fmt.Errorf("read PkmnPrices progress: %w", err)
	}
	logger.Info(
		"PkmnPrices backfill status",
		"completed_targets", completed,
		"total_targets", targets,
		"stored_observations", observations,
		"credits_used_today", credits,
		"automation_budget", dailyBudget,
	)
	return nil
}

func (client *pkmnPricesClient) history(
	ctx context.Context,
	target backfillTarget,
	limit int,
) (historyResult, error) {
	endpoint, err := url.Parse(fmt.Sprintf(
		"%s/cards/%d/prices/history",
		client.baseURL,
		target.ProviderCardID,
	))
	if err != nil {
		return historyResult{}, fmt.Errorf("build PkmnPrices URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("currency", historyCurrency)
	query.Set("period", historyPeriod)
	query.Set("condition", target.Condition)
	query.Set("variant", target.Printing)
	query.Set("limit", strconv.Itoa(limit))
	query.Set("page", strconv.Itoa(target.NextPage))
	endpoint.RawQuery = query.Encode()

	for attempt := 1; attempt <= maximumRequestAttempts; attempt++ {
		if err := client.wait(ctx); err != nil {
			return historyResult{}, err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			return historyResult{}, fmt.Errorf("create PkmnPrices request: %w", err)
		}
		request.Header.Set("Accept", "application/json")
		request.Header.Set("X-API-Key", client.apiKey)
		client.lastRequest = time.Now()

		response, err := client.httpClient.Do(request)
		if err != nil {
			if attempt == maximumRequestAttempts {
				return historyResult{}, fmt.Errorf("request PkmnPrices history: %w", err)
			}
			if err := waitForRetry(ctx, attempt); err != nil {
				return historyResult{}, err
			}
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes))
		response.Body.Close()
		if readErr != nil {
			return historyResult{}, fmt.Errorf("read PkmnPrices response: %w", readErr)
		}
		if response.StatusCode == http.StatusTooManyRequests {
			return historyResult{}, fmt.Errorf("%w: retry after the next provider reset", errRateLimited)
		}
		if response.StatusCode >= 500 && attempt < maximumRequestAttempts {
			if err := waitForRetry(ctx, attempt); err != nil {
				return historyResult{}, err
			}
			continue
		}
		if response.StatusCode != http.StatusOK {
			return historyResult{}, fmt.Errorf(
				"PkmnPrices returned %d: %s",
				response.StatusCode,
				providerError(body),
			)
		}

		var parsed historyResponse
		if err := json.Unmarshal(body, &parsed); err != nil {
			return historyResult{}, fmt.Errorf("decode PkmnPrices history: %w", err)
		}
		return historyResult{
			Response:       parsed,
			CreditsCharged: headerInteger(response.Header, "X-Credits-Charged", len(parsed.Data)),
			CreditLimit:    headerInteger(response.Header, "X-Credits-Limit", 0),
			RateRemaining:  headerInteger(response.Header, "X-Rate-Remaining", 0),
		}, nil
	}

	return historyResult{}, errors.New("PkmnPrices request attempts exhausted")
}

func (client *pkmnPricesClient) wait(ctx context.Context) error {
	remaining := client.delay - time.Since(client.lastRequest)
	if client.lastRequest.IsZero() || remaining <= 0 {
		return nil
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func waitForRetry(ctx context.Context, attempt int) error {
	base := time.Duration(1<<uint(attempt-1)) * time.Second
	jitter := time.Duration(rand.IntN(500)) * time.Millisecond
	timer := time.NewTimer(base + jitter)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func providerError(body []byte) string {
	var parsed struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &parsed) == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	return strings.TrimSpace(string(body))
}

func headerInteger(headers http.Header, key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(headers.Get(key)))
	if err != nil {
		return fallback
	}
	return value
}

func durationFromMilliseconds(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	milliseconds, err := strconv.Atoi(value)
	if err != nil || milliseconds < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer", key)
	}
	return time.Duration(milliseconds) * time.Millisecond, nil
}

func positiveInteger(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func booleanEnvironment(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
	}
	return parsed, nil
}

func valueOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
