package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
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
	providerName                 = "JustTCG"
	defaultBaseURL               = "https://api.justtcg.com/v1"
	defaultDailyRequestBudget    = 28
	defaultBootstrapDailyBudget  = 0
	defaultLegacyTargetSetCount  = 38
	maximumDailyRequestBudget    = 95
	defaultDailyRequestReserve   = 5
	defaultMonthlyRequestReserve = 100
	defaultRequestDelay          = 6500 * time.Millisecond
	defaultRefreshHistoryWindow  = "30d"
	minimumRequestDelay          = 6000 * time.Millisecond
	freeTierBatchSize            = 20
	maximumResponseBytes         = 16 << 20
)

var (
	errRateLimited = errors.New("JustTCG rate limit reached")
	specialCardIDs = []string{
		"pokemon-base-set-shadowless-machamp-holo-rare",
		"pokemon-base-set-machamp-first-edition-holo-rare",
	}
)

type refreshTarget struct {
	CardID             string
	ProviderUUID       *string
	TCGPlayerProductID *string
}

type batchLookup struct {
	CardID      string `json:"cardId,omitempty"`
	TCGPlayerID string `json:"tcgplayerId,omitempty"`
}

type providerCard struct {
	ID          string            `json:"id"`
	UUID        string            `json:"uuid"`
	TCGPlayerID string            `json:"tcgplayerId"`
	Variants    []providerVariant `json:"variants"`
}

type providerVariant struct {
	ID                string               `json:"id"`
	UUID              string               `json:"uuid"`
	Condition         string               `json:"condition"`
	Printing          string               `json:"printing"`
	Language          string               `json:"language"`
	Price             *float64             `json:"price"`
	PriceChange24Hour *float64             `json:"priceChange24hr"`
	LastUpdated       int64                `json:"lastUpdated"`
	PriceHistory      []providerPricePoint `json:"priceHistory"`
}

type providerPricePoint struct {
	Price     *float64 `json:"p"`
	Timestamp int64    `json:"t"`
}

type usageMetadata struct {
	APIRequestLimit           int    `json:"apiRequestLimit"`
	APIDailyLimit             int    `json:"apiDailyLimit"`
	APIRequestsUsed           int    `json:"apiRequestsUsed"`
	APIDailyRequestsUsed      int    `json:"apiDailyRequestsUsed"`
	APIRequestsRemaining      int    `json:"apiRequestsRemaining"`
	APIDailyRequestsRemaining int    `json:"apiDailyRequestsRemaining"`
	APIPlan                   string `json:"apiPlan"`
}

type batchResponse struct {
	Data     []providerCard `json:"data"`
	Metadata usageMetadata  `json:"_metadata"`
}

type importStats struct {
	Cards                  int
	Variants               int
	Observations           int
	HistoricalObservations int
	Skipped                int
}

type priceObservation struct {
	VariantID  string
	ObservedOn time.Time
	Price      float64
}

type justTCGClient struct {
	apiKey        string
	baseURL       string
	httpClient    *http.Client
	delay         time.Duration
	historyWindow string
	lastRequest   time.Time
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("JustTCG refresh failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	statusOnly := flag.Bool("status", false, "show production refresh status without calling JustTCG")
	flag.Parse()

	apiKey := strings.TrimSpace(os.Getenv("JUSTTCG_API_KEY"))
	if apiKey == "" && !*statusOnly {
		return errors.New("JUSTTCG_API_KEY must be set")
	}
	baseURL := strings.TrimRight(valueOrDefault("JUSTTCG_BASE_URL", defaultBaseURL), "/")
	delay, err := durationFromMilliseconds("JUSTTCG_REQUEST_INTERVAL_MS", defaultRequestDelay)
	if err != nil {
		return err
	}
	if delay < minimumRequestDelay {
		return fmt.Errorf(
			"JUSTTCG_REQUEST_INTERVAL_MS must be at least %d",
			minimumRequestDelay.Milliseconds(),
		)
	}
	steadyDailyBudget, err := positiveInteger(
		"JUSTTCG_DAILY_REFRESH_REQUEST_BUDGET",
		defaultDailyRequestBudget,
	)
	if err != nil {
		return err
	}
	if steadyDailyBudget > maximumDailyRequestBudget {
		return fmt.Errorf(
			"JUSTTCG_DAILY_REFRESH_REQUEST_BUDGET must not exceed %d",
			maximumDailyRequestBudget,
		)
	}
	bootstrapDailyBudget, err := nonnegativeInteger(
		"JUSTTCG_BOOTSTRAP_DAILY_REFRESH_REQUEST_BUDGET",
		defaultBootstrapDailyBudget,
	)
	if err != nil {
		return err
	}
	if bootstrapDailyBudget > maximumDailyRequestBudget {
		return fmt.Errorf(
			"JUSTTCG_BOOTSTRAP_DAILY_REFRESH_REQUEST_BUDGET must not exceed %d",
			maximumDailyRequestBudget,
		)
	}
	legacyTargetSetCount, err := positiveInteger(
		"JUSTTCG_LEGACY_TARGET_SET_COUNT",
		defaultLegacyTargetSetCount,
	)
	if err != nil {
		return err
	}
	dailyReserve, err := nonnegativeInteger(
		"JUSTTCG_DAILY_REQUEST_RESERVE",
		defaultDailyRequestReserve,
	)
	if err != nil {
		return err
	}
	monthlyReserve, err := nonnegativeInteger(
		"JUSTTCG_MONTHLY_REQUEST_RESERVE",
		defaultMonthlyRequestReserve,
	)
	if err != nil {
		return err
	}
	historyWindow, err := priceHistoryWindow(
		"JUSTTCG_REFRESH_HISTORY_DURATION",
		defaultRefreshHistoryWindow,
	)
	if err != nil {
		return err
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

	setCount, err := catalogSetCount(ctx, db)
	if err != nil {
		return err
	}
	dailyBudget, collectionPhase := selectDailyBudget(
		setCount,
		legacyTargetSetCount,
		bootstrapDailyBudget,
		steadyDailyBudget,
	)

	usageDay := time.Now().UTC().Format(time.DateOnly)
	requestsUsed, err := dailyRequests(ctx, db, usageDay)
	if err != nil {
		return err
	}
	requestsAvailable := dailyBudget - requestsUsed
	if *statusOnly {
		targets, err := dueTargets(ctx, db, 1_000_000)
		if err != nil {
			return err
		}
		maximumRotationDays := estimatedRotationDays(len(targets), dailyBudget)
		logger.Info(
			"JustTCG production refresh status",
			"refresh_targets", len(targets),
			"requests_used_today", requestsUsed,
			"automation_budget", dailyBudget,
			"maximum_rotation_days", maximumRotationDays,
			"history_duration", historyWindow,
			"collection_phase", collectionPhase,
			"catalog_sets", setCount,
			"legacy_target_sets", legacyTargetSetCount,
			"cards_per_request", freeTierBatchSize,
		)
		return nil
	}
	if requestsAvailable <= 0 {
		logger.Info(
			"JustTCG daily refresh budget already used",
			"requests_used_today", requestsUsed,
			"automation_budget", dailyBudget,
		)
		return nil
	}

	targets, err := dueTargets(ctx, db, requestsAvailable*freeTierBatchSize)
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		logger.Info("no JustTCG catalog targets are due")
		return nil
	}

	client := &justTCGClient{
		apiKey:        apiKey,
		baseURL:       baseURL,
		httpClient:    &http.Client{Timeout: 45 * time.Second},
		delay:         delay,
		historyWindow: historyWindow,
	}
	total := importStats{}
	requestsMade := 0
	for start := 0; start < len(targets); start += freeTierBatchSize {
		end := min(start+freeTierBatchSize, len(targets))
		lookups := targetLookups(targets[start:end])

		if err := recordRequest(ctx, db, usageDay); err != nil {
			return err
		}
		requestsMade++
		response, err := client.batch(ctx, lookups)
		if errors.Is(err, errRateLimited) {
			logger.Warn("JustTCG stopped the refresh at its provider rate limit")
			break
		}
		if err != nil {
			return err
		}

		stats, err := saveBatch(ctx, db, lookups, response.Data, time.Now().UTC())
		if err != nil {
			return err
		}
		total.Cards += stats.Cards
		total.Variants += stats.Variants
		total.Observations += stats.Observations
		total.HistoricalObservations += stats.HistoricalObservations
		total.Skipped += stats.Skipped

		logger.Info(
			"saved JustTCG current-price batch",
			"request", requestsMade,
			"requested_cards", len(lookups),
			"returned_cards", len(response.Data),
			"updated_variants", stats.Variants,
			"observations", stats.Observations,
			"historical_observations", stats.HistoricalObservations,
			"skipped_variants", stats.Skipped,
			"provider_monthly_remaining", response.Metadata.APIRequestsRemaining,
			"provider_daily_remaining", response.Metadata.APIDailyRequestsRemaining,
		)

		if quotaReserveReached(response.Metadata, dailyReserve, monthlyReserve) {
			logger.Warn(
				"JustTCG provider reserve reached; stopping safely",
				"monthly_remaining", response.Metadata.APIRequestsRemaining,
				"monthly_reserve", monthlyReserve,
				"daily_remaining", response.Metadata.APIDailyRequestsRemaining,
				"daily_reserve", dailyReserve,
			)
			break
		}
	}

	if _, err := db.Exec(ctx, "SELECT refresh_catalog_price_quality()"); err != nil {
		return fmt.Errorf("refresh catalog price quality: %w", err)
	}
	if _, err := db.Exec(ctx, "SELECT refresh_market_variant_movements()"); err != nil {
		return fmt.Errorf("refresh market movement snapshots: %w", err)
	}
	logger.Info(
		"JustTCG daily refresh complete",
		"requests", requestsMade,
		"cards", total.Cards,
		"variants", total.Variants,
		"observations", total.Observations,
		"historical_observations", total.HistoricalObservations,
		"skipped_variants", total.Skipped,
		"automation_budget", dailyBudget,
		"collection_phase", collectionPhase,
	)
	return nil
}

func catalogSetCount(ctx context.Context, db *pgxpool.Pool) (int, error) {
	var count int
	if err := db.QueryRow(ctx, `
		SELECT count(*)::integer
		FROM catalog_sets
		WHERE id <> 'base-set-first-edition-pokemon'
	`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count catalog sets: %w", err)
	}
	return count, nil
}

func selectDailyBudget(
	setCount int,
	legacyTargetSetCount int,
	bootstrapBudget int,
	steadyBudget int,
) (int, string) {
	if setCount < legacyTargetSetCount {
		return bootstrapBudget, "historical-bootstrap"
	}
	return steadyBudget, "steady-state"
}

func estimatedRotationDays(targetCount int, dailyRequestBudget int) int {
	if targetCount <= 0 || dailyRequestBudget <= 0 {
		return 0
	}
	dailyCardCapacity := dailyRequestBudget * freeTierBatchSize
	return (targetCount + dailyCardCapacity - 1) / dailyCardCapacity
}

func dueTargets(ctx context.Context, db *pgxpool.Pool, limit int) ([]refreshTarget, error) {
	rows, err := db.Query(ctx, `
		WITH targets AS (
			SELECT
				c.id AS card_id,
				c.uuid::text AS provider_uuid,
				c.tcgplayer_product_id::text AS tcgplayer_product_id
			FROM catalog_cards c
			WHERE c.uuid IS NOT NULL

			UNION ALL

			SELECT
				c.id AS card_id,
				NULL::text AS provider_uuid,
				c.tcgplayer_product_id::text AS tcgplayer_product_id
			FROM catalog_cards c
			WHERE c.id = ANY($1)
				AND c.uuid IS NULL
				AND c.tcgplayer_product_id IS NOT NULL
		), freshness AS (
			SELECT
				t.card_id,
				t.provider_uuid,
				t.tcgplayer_product_id,
				max(related.imported_at) AS refreshed_at
			FROM targets t
			LEFT JOIN catalog_cards related
				ON related.id = t.card_id
				OR (
					t.tcgplayer_product_id IS NOT NULL
					AND related.tcgplayer_product_id::text = t.tcgplayer_product_id
				)
			GROUP BY t.card_id, t.provider_uuid, t.tcgplayer_product_id
		)
		SELECT card_id, provider_uuid, tcgplayer_product_id
		FROM freshness
		ORDER BY refreshed_at NULLS FIRST, card_id
		LIMIT $2
	`, specialCardIDs, limit)
	if err != nil {
		return nil, fmt.Errorf("select JustTCG refresh targets: %w", err)
	}
	defer rows.Close()

	targets := make([]refreshTarget, 0, limit)
	for rows.Next() {
		var target refreshTarget
		if err := rows.Scan(
			&target.CardID,
			&target.ProviderUUID,
			&target.TCGPlayerProductID,
		); err != nil {
			return nil, fmt.Errorf("scan JustTCG refresh target: %w", err)
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read JustTCG refresh targets: %w", err)
	}
	return targets, nil
}

func targetLookups(targets []refreshTarget) []batchLookup {
	lookups := make([]batchLookup, 0, len(targets))
	for _, target := range targets {
		lookup := batchLookup{}
		if target.ProviderUUID != nil && strings.TrimSpace(*target.ProviderUUID) != "" {
			lookup.CardID = strings.TrimSpace(*target.ProviderUUID)
		} else if target.TCGPlayerProductID != nil {
			lookup.TCGPlayerID = strings.TrimSpace(*target.TCGPlayerProductID)
		}
		if lookup.CardID != "" || lookup.TCGPlayerID != "" {
			lookups = append(lookups, lookup)
		}
	}
	return lookups
}

func saveBatch(
	ctx context.Context,
	db *pgxpool.Pool,
	lookups []batchLookup,
	cards []providerCard,
	observedAt time.Time,
) (importStats, error) {
	expectedUUIDs := make(map[string]struct{}, len(lookups))
	expectedProducts := make(map[string]struct{}, len(lookups))
	for _, lookup := range lookups {
		if lookup.CardID != "" {
			expectedUUIDs[lookup.CardID] = struct{}{}
		}
		if lookup.TCGPlayerID != "" {
			expectedProducts[lookup.TCGPlayerID] = struct{}{}
		}
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return importStats{}, fmt.Errorf("begin JustTCG refresh import: %w", err)
	}
	defer tx.Rollback(ctx)

	stats := importStats{}
	observations := make(map[string]priceObservation)
	for _, card := range cards {
		if _, ok := expectedUUIDs[card.UUID]; !ok {
			if _, ok := expectedProducts[card.TCGPlayerID]; !ok {
				return importStats{}, fmt.Errorf(
					"JustTCG returned unrequested card %q (%s)",
					card.ID,
					card.UUID,
				)
			}
		}

		productID := parseInt64(card.TCGPlayerID)
		if _, err := tx.Exec(ctx, `
			UPDATE catalog_cards
			SET imported_at = now()
			WHERE ($1 <> '' AND uuid = $1)
				OR ($2::bigint IS NOT NULL AND tcgplayer_product_id = $2)
		`, card.UUID, productID); err != nil {
			return importStats{}, fmt.Errorf("mark card %s refreshed: %w", card.ID, err)
		}
		stats.Cards++

		for _, variant := range card.Variants {
			if variant.Price != nil && *variant.Price < 0 {
				return importStats{}, fmt.Errorf("variant %s has a negative price", variant.ID)
			}
			storedID, err := findStoredVariant(ctx, tx, productID, variant)
			if errors.Is(err, pgx.ErrNoRows) {
				stats.Skipped++
				continue
			}
			if err != nil {
				return importStats{}, err
			}

			if _, err := tx.Exec(ctx, `
				UPDATE catalog_card_variants
				SET
					current_price = coalesce($2, current_price),
					price_change_24h = $3,
					source_updated_at = coalesce($4, source_updated_at),
					source_provider = $5,
					imported_at = now()
				WHERE id = $1
			`, storedID, variant.Price, variant.PriceChange24Hour,
				parseUnixTime(variant.LastUpdated), providerName); err != nil {
				return importStats{}, fmt.Errorf("update variant %s: %w", storedID, err)
			}
			stats.Variants++

			variantObservations, historicalCount, err := observationsForVariant(
				storedID,
				variant,
				observedAt,
			)
			if err != nil {
				return importStats{}, err
			}
			for key, observation := range variantObservations {
				observations[key] = observation
			}
			stats.HistoricalObservations += historicalCount
		}
	}

	if err := saveObservations(ctx, tx, observations); err != nil {
		return importStats{}, err
	}
	stats.Observations = len(observations)

	if err := tx.Commit(ctx); err != nil {
		return importStats{}, fmt.Errorf("commit JustTCG refresh import: %w", err)
	}
	return stats, nil
}

func observationsForVariant(
	storedID string,
	variant providerVariant,
	observedAt time.Time,
) (map[string]priceObservation, int, error) {
	observations := make(map[string]priceObservation, len(variant.PriceHistory)+1)
	historicalCount := 0
	for _, point := range variant.PriceHistory {
		if point.Price == nil {
			continue
		}
		if *point.Price < 0 {
			return nil, 0, fmt.Errorf("variant %s has a negative historical price", variant.ID)
		}
		observedAt := parseUnixTime(point.Timestamp)
		if observedAt == nil {
			continue
		}
		date := observedAt.Format(time.DateOnly)
		key := storedID + "\x00" + date
		observations[key] = priceObservation{
			VariantID:  storedID,
			ObservedOn: dayStart(*observedAt),
			Price:      *point.Price,
		}
		historicalCount++
	}
	if variant.Price != nil {
		currentDay := dayStart(observedAt)
		key := storedID + "\x00" + currentDay.Format(time.DateOnly)
		observations[key] = priceObservation{
			VariantID:  storedID,
			ObservedOn: currentDay,
			Price:      *variant.Price,
		}
	}
	return observations, historicalCount, nil
}

func dayStart(value time.Time) time.Time {
	utc := value.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}

func saveObservations(
	ctx context.Context,
	tx pgx.Tx,
	observations map[string]priceObservation,
) error {
	if len(observations) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE justtcg_price_observation_import (
			variant_id text NOT NULL,
			observed_on date NOT NULL,
			price numeric NOT NULL
		) ON COMMIT DROP
	`); err != nil {
		return fmt.Errorf("create JustTCG observation staging table: %w", err)
	}

	rows := make([][]any, 0, len(observations))
	for _, observation := range observations {
		rows = append(rows, []any{
			observation.VariantID,
			observation.ObservedOn,
			observation.Price,
		})
	}
	if _, err := tx.CopyFrom(
		ctx,
		pgx.Identifier{"justtcg_price_observation_import"},
		[]string{"variant_id", "observed_on", "price"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return fmt.Errorf("stage JustTCG observations: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO price_observations (
			variant_id, observed_on, price, source_provider, imported_at
		)
		SELECT variant_id, observed_on, price, $1, now()
		FROM justtcg_price_observation_import
		ON CONFLICT (variant_id, observed_on) DO UPDATE SET
			price = EXCLUDED.price,
			source_provider = EXCLUDED.source_provider,
			imported_at = now()
	`, providerName); err != nil {
		return fmt.Errorf("save JustTCG observations: %w", err)
	}
	return nil
}

func findStoredVariant(
	ctx context.Context,
	tx pgx.Tx,
	productID *int64,
	variant providerVariant,
) (string, error) {
	var storedID string
	err := tx.QueryRow(ctx, `
		SELECT v.id
		FROM catalog_card_variants v
		JOIN catalog_cards c ON c.id = v.card_id
		WHERE v.id = $1
			OR ($2 <> '' AND v.uuid = $2)
			OR (
				$3::bigint IS NOT NULL
				AND c.tcgplayer_product_id = $3
				AND v.condition = $4
				AND v.printing = $5
				AND ($6 = '' OR v.language = $6)
			)
		ORDER BY CASE
			WHEN v.id = $1 THEN 0
			WHEN $2 <> '' AND v.uuid = $2 THEN 1
			ELSE 2
		END
		LIMIT 1
	`, variant.ID, variant.UUID, productID, variant.Condition, variant.Printing, variant.Language).Scan(&storedID)
	if err != nil {
		return "", fmt.Errorf("find catalog variant for %s: %w", variant.ID, err)
	}
	return storedID, nil
}

func dailyRequests(ctx context.Context, db *pgxpool.Pool, usageDay string) (int, error) {
	var requests int
	err := db.QueryRow(ctx, `
		SELECT requests
		FROM provider_api_usage
		WHERE provider = $1 AND usage_on = $2
	`, providerName, usageDay).Scan(&requests)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read JustTCG usage: %w", err)
	}
	return requests, nil
}

func recordRequest(ctx context.Context, db *pgxpool.Pool, usageDay string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO provider_api_usage (provider, usage_on, requests, credits)
		VALUES ($1, $2, 1, 0)
		ON CONFLICT (provider, usage_on) DO UPDATE SET
			requests = provider_api_usage.requests + 1,
			updated_at = now()
	`, providerName, usageDay)
	if err != nil {
		return fmt.Errorf("record JustTCG request: %w", err)
	}
	return nil
}

func (client *justTCGClient) batch(ctx context.Context, lookups []batchLookup) (batchResponse, error) {
	if len(lookups) == 0 || len(lookups) > freeTierBatchSize {
		return batchResponse{}, fmt.Errorf("JustTCG batch must contain 1-%d cards", freeTierBatchSize)
	}
	if err := client.wait(ctx); err != nil {
		return batchResponse{}, err
	}
	body, err := json.Marshal(lookups)
	if err != nil {
		return batchResponse{}, fmt.Errorf("encode JustTCG batch: %w", err)
	}
	endpoint, err := url.Parse(client.baseURL + "/cards")
	if err != nil {
		return batchResponse{}, fmt.Errorf("parse JustTCG batch URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("include_price_history", "true")
	query.Set("priceHistoryDuration", client.historyWindow)
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint.String(),
		bytes.NewReader(body),
	)
	if err != nil {
		return batchResponse{}, fmt.Errorf("create JustTCG request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-api-key", client.apiKey)
	client.lastRequest = time.Now()

	response, err := client.httpClient.Do(request)
	if err != nil {
		return batchResponse{}, fmt.Errorf("request JustTCG batch: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes))
	if err != nil {
		return batchResponse{}, fmt.Errorf("read JustTCG response: %w", err)
	}
	if response.StatusCode == http.StatusTooManyRequests {
		return batchResponse{}, errRateLimited
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return batchResponse{}, fmt.Errorf(
			"JustTCG returned HTTP %d: %s",
			response.StatusCode,
			strings.TrimSpace(string(responseBody)),
		)
	}

	var result batchResponse
	decoder := json.NewDecoder(bytes.NewReader(responseBody))
	if err := decoder.Decode(&result); err != nil {
		return batchResponse{}, fmt.Errorf("decode JustTCG response: %w", err)
	}
	return result, nil
}

func (client *justTCGClient) wait(ctx context.Context) error {
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

func quotaReserveReached(metadata usageMetadata, dailyReserve, monthlyReserve int) bool {
	if metadata.APIPlan == "" {
		return false
	}
	return metadata.APIDailyRequestsRemaining <= dailyReserve ||
		metadata.APIRequestsRemaining <= monthlyReserve
}

func durationFromMilliseconds(name string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	milliseconds, err := strconv.Atoi(value)
	if err != nil || milliseconds < 0 {
		return 0, fmt.Errorf("%s must be a nonnegative integer", name)
	}
	return time.Duration(milliseconds) * time.Millisecond, nil
}

func positiveInteger(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return parsed, nil
}

func nonnegativeInteger(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0, fmt.Errorf("%s must be a nonnegative integer", name)
	}
	return parsed, nil
}

func priceHistoryWindow(name string, fallback string) (string, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		value = fallback
	}
	allowed := map[string]struct{}{
		"7d": {}, "30d": {}, "90d": {}, "180d": {}, "1y": {},
	}
	if _, ok := allowed[value]; !ok {
		return "", fmt.Errorf("%s must be one of 7d, 30d, 90d, 180d, or 1y", name)
	}
	return value, nil
}

func parseInt64(value string) *int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseUnixTime(value int64) *time.Time {
	if value <= 0 {
		return nil
	}
	parsed := time.Unix(value, 0).UTC()
	return &parsed
}

func valueOrDefault(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
