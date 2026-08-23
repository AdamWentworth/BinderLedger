package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/database"
	"github.com/jackc/pgx/v5"
)

const priceCopyBatchSize = 5_000

type collection struct {
	Provider    string         `json:"provider"`
	CollectedAt string         `json:"collectedAt"`
	Set         providerSet    `json:"set"`
	Cards       []providerCard `json:"cards"`
}

type providerSet struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Game        string `json:"game"`
	Count       int    `json:"count"`
	CardsCount  int    `json:"cards_count"`
	ReleaseDate string `json:"release_date"`
}

type providerCard struct {
	ID          string            `json:"id"`
	UUID        string            `json:"uuid"`
	Name        string            `json:"name"`
	Number      string            `json:"number"`
	Rarity      string            `json:"rarity"`
	TCGPlayerID string            `json:"tcgplayerId"`
	Variants    []providerVariant `json:"variants"`
}

type providerVariant struct {
	ID                string         `json:"id"`
	UUID              string         `json:"uuid"`
	Condition         string         `json:"condition"`
	Printing          string         `json:"printing"`
	Language          string         `json:"language"`
	TCGPlayerSKUID    string         `json:"tcgplayerSkuId"`
	Price             *float64       `json:"price"`
	PriceChange24Hour *float64       `json:"priceChange24hr"`
	LastUpdated       int64          `json:"lastUpdated"`
	PriceHistory      []historyPoint `json:"priceHistory"`
}

type historyPoint struct {
	Price     *float64 `json:"p"`
	Timestamp int64    `json:"t"`
}

type importStats struct {
	Sets         int
	Cards        int
	Variants     int
	Observations int
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("import failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	defaultDirectory := filepath.Join("tools", "justtcg-audit", "output", "collections")
	directory := flag.String("dir", defaultDirectory, "directory containing collected set JSON files")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	files, err := filepath.Glob(filepath.Join(*directory, "*.json"))
	if err != nil {
		return fmt.Errorf("find collection files: %w", err)
	}
	if len(files) == 0 {
		return fmt.Errorf("no collection JSON files found in %s", *directory)
	}

	total := importStats{}
	for _, filename := range files {
		stats, err := importFile(ctx, pool, filename)
		if err != nil {
			return fmt.Errorf("import %s: %w", filename, err)
		}
		total.Sets += stats.Sets
		total.Cards += stats.Cards
		total.Variants += stats.Variants
		total.Observations += stats.Observations
		logger.Info("collection imported",
			"file", filepath.Base(filename),
			"cards", stats.Cards,
			"variants", stats.Variants,
			"observations", stats.Observations,
		)
	}

	logger.Info("JustTCG import complete",
		"sets", total.Sets,
		"cards", total.Cards,
		"variants", total.Variants,
		"observations", total.Observations,
	)
	return nil
}

type databasePool interface {
	Begin(context.Context) (pgx.Tx, error)
}

func importFile(ctx context.Context, pool databasePool, filename string) (importStats, error) {
	file, err := os.Open(filename)
	if err != nil {
		return importStats{}, fmt.Errorf("open file: %w", err)
	}
	defer file.Close()

	var data collection
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		return importStats{}, fmt.Errorf("decode JSON: %w", err)
	}
	if err := ensureJSONEnd(decoder); err != nil {
		return importStats{}, err
	}
	if data.Set.ID == "" || data.Set.Name == "" {
		return importStats{}, errors.New("collection is missing its set identity")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return importStats{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	collectedAt := parseRFC3339(data.CollectedAt)
	releaseDate := parseDate(data.Set.ReleaseDate)
	declaredCount := data.Set.CardsCount
	if declaredCount == 0 {
		declaredCount = data.Set.Count
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO catalog_sets (
			id, game, name, release_date, declared_card_count, provider,
			source_file, source_collected_at, imported_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
		ON CONFLICT (id) DO UPDATE SET
			game = EXCLUDED.game,
			name = EXCLUDED.name,
			release_date = EXCLUDED.release_date,
			declared_card_count = EXCLUDED.declared_card_count,
			provider = EXCLUDED.provider,
			source_file = EXCLUDED.source_file,
			source_collected_at = EXCLUDED.source_collected_at,
			imported_at = now()
	`, data.Set.ID, valueOrDefault(data.Set.Game, "Pokemon"), data.Set.Name, releaseDate,
		declaredCount, valueOrDefault(data.Provider, "JustTCG"), filepath.Base(filename), collectedAt)
	if err != nil {
		return importStats{}, fmt.Errorf("upsert set: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE import_price_observations (
			variant_id text NOT NULL,
			observed_on date NOT NULL,
			price numeric(12, 2) NOT NULL
		) ON COMMIT DROP
	`); err != nil {
		return importStats{}, fmt.Errorf("create observation staging table: %w", err)
	}

	stats := importStats{Sets: 1}
	priceRows := make([][]any, 0, priceCopyBatchSize)
	flushPrices := func() error {
		if len(priceRows) == 0 {
			return nil
		}
		_, err := tx.CopyFrom(
			ctx,
			pgx.Identifier{"import_price_observations"},
			[]string{"variant_id", "observed_on", "price"},
			pgx.CopyFromRows(priceRows),
		)
		priceRows = priceRows[:0]
		return err
	}

	for _, card := range data.Cards {
		productID := parseInt64(card.TCGPlayerID)
		imageURL := ""
		if productID != nil {
			imageURL = fmt.Sprintf("https://product-images.tcgplayer.com/fit-in/437x437/%d.jpg", *productID)
		}

		_, err := tx.Exec(ctx, `
			INSERT INTO catalog_cards (
				id, uuid, set_id, tcgplayer_product_id, name, number,
				number_sort, rarity, image_url, imported_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
			ON CONFLICT (id) DO UPDATE SET
				uuid = EXCLUDED.uuid,
				set_id = EXCLUDED.set_id,
				tcgplayer_product_id = EXCLUDED.tcgplayer_product_id,
				name = EXCLUDED.name,
				number = EXCLUDED.number,
				number_sort = EXCLUDED.number_sort,
				rarity = EXCLUDED.rarity,
				image_url = EXCLUDED.image_url,
				imported_at = now()
		`, card.ID, nullIfEmpty(card.UUID), data.Set.ID, productID, card.Name,
			nullIfEmpty(card.Number), numberSort(card.Number), nullIfEmpty(card.Rarity), nullIfEmpty(imageURL))
		if err != nil {
			return importStats{}, fmt.Errorf("upsert card %s: %w", card.ID, err)
		}
		stats.Cards++

		for _, variant := range card.Variants {
			_, err := tx.Exec(ctx, `
				INSERT INTO catalog_card_variants (
					id, uuid, card_id, tcgplayer_sku_id, printing, condition,
					language, current_price, price_change_24h, source_updated_at, imported_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
				ON CONFLICT (id) DO UPDATE SET
					uuid = EXCLUDED.uuid,
					card_id = EXCLUDED.card_id,
					tcgplayer_sku_id = EXCLUDED.tcgplayer_sku_id,
					printing = EXCLUDED.printing,
					condition = EXCLUDED.condition,
					language = EXCLUDED.language,
					current_price = EXCLUDED.current_price,
					price_change_24h = EXCLUDED.price_change_24h,
					source_updated_at = EXCLUDED.source_updated_at,
					imported_at = now()
			`, variant.ID, nullIfEmpty(variant.UUID), card.ID, parseInt64(variant.TCGPlayerSKUID),
				valueOrDefault(variant.Printing, "Unknown"), valueOrDefault(variant.Condition, "Unknown"),
				valueOrDefault(variant.Language, "Unknown"), variant.Price, variant.PriceChange24Hour,
				parseUnixTime(variant.LastUpdated))
			if err != nil {
				return importStats{}, fmt.Errorf("upsert variant %s: %w", variant.ID, err)
			}
			stats.Variants++

			for _, point := range variant.PriceHistory {
				if point.Price == nil || *point.Price < 0 || point.Timestamp <= 0 {
					continue
				}
				priceRows = append(priceRows, []any{
					variant.ID,
					time.Unix(point.Timestamp, 0).UTC().Format(time.DateOnly),
					*point.Price,
				})
				stats.Observations++
				if len(priceRows) == priceCopyBatchSize {
					if err := flushPrices(); err != nil {
						return importStats{}, fmt.Errorf("stage observations: %w", err)
					}
				}
			}
		}
	}

	if err := flushPrices(); err != nil {
		return importStats{}, fmt.Errorf("stage observations: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO price_observations (variant_id, observed_on, price, imported_at)
		SELECT DISTINCT ON (variant_id, observed_on)
			variant_id, observed_on, price, now()
		FROM import_price_observations
		ORDER BY variant_id, observed_on
		ON CONFLICT (variant_id, observed_on) DO UPDATE SET
			price = EXCLUDED.price,
			imported_at = now()
	`); err != nil {
		return importStats{}, fmt.Errorf("merge observations: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return importStats{}, fmt.Errorf("commit transaction: %w", err)
	}
	return stats, nil
}

func ensureJSONEnd(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("collection file contains more than one JSON value")
		}
		return fmt.Errorf("read JSON end: %w", err)
	}
	return nil
}

func numberSort(number string) *int {
	first, _, _ := strings.Cut(number, "/")
	value, err := strconv.Atoi(strings.TrimLeft(strings.TrimSpace(first), "0"))
	if err != nil {
		return nil
	}
	return &value
}

func parseInt64(value string) *int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseRFC3339(value string) *time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseDate(value string) *string {
	if parsed := parseRFC3339(value); parsed != nil {
		date := parsed.UTC().Format(time.DateOnly)
		return &date
	}
	return nil
}

func parseUnixTime(value int64) *time.Time {
	if value <= 0 {
		return nil
	}
	parsed := time.Unix(value, 0).UTC()
	return &parsed
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func valueOrDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
