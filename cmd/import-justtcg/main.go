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

const (
	priceCopyBatchSize      = 5_000
	machampSpecialFilename  = "base-set-machamp.json"
	baseSetID               = "base-set-pokemon"
	baseSetShadowlessID     = "base-set-shadowless-pokemon"
	baseSetFirstEditionID   = "base-set-first-edition-pokemon"
	baseSetShadowlessPrefix = "pokemon-base-set-shadowless-"
	baseSetFirstPrefix      = "pokemon-base-set-first-edition-"
)

var excludedProviderCardIDs = map[string]struct{}{
	"pokemon-base-set-charizard-black-dot-error-holo-rare": {},
}

var machampCardIDsByProduct = map[string]string{
	"107004": "pokemon-base-set-shadowless-machamp-holo-rare",
	"42425":  "pokemon-base-set-machamp-first-edition-holo-rare",
}

var conditionCodes = map[string]string{
	"Near Mint":         "near-mint",
	"Lightly Played":    "lightly-played",
	"Moderately Played": "moderately-played",
	"Heavily Played":    "heavily-played",
	"Damaged":           "damaged",
}

type collection struct {
	Provider    string         `json:"provider"`
	CollectedAt string         `json:"collectedAt"`
	Set         providerSet    `json:"set"`
	Cards       []providerCard `json:"cards"`
}

type specialCollection struct {
	Provider           string         `json:"provider"`
	CollectedAt        string         `json:"collectedAt"`
	CollectionComplete bool           `json:"collectionComplete"`
	Cards              []providerCard `json:"cards"`
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

	files, err := filepath.Glob(filepath.Join(*directory, "*-pokemon.json"))
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
	specialFilename := filepath.Join(
		filepath.Dir(*directory),
		"specials",
		machampSpecialFilename,
	)
	if _, err := os.Stat(specialFilename); err == nil {
		stats, err := importMachampAliases(ctx, pool, specialFilename)
		if err != nil {
			return fmt.Errorf("import %s: %w", specialFilename, err)
		}
		total.Cards += stats.Cards
		total.Variants += stats.Variants
		total.Observations += stats.Observations
		logger.Info("special collection imported",
			"file", filepath.Base(specialFilename),
			"cards", stats.Cards,
			"variants", stats.Variants,
			"observations", stats.Observations,
		)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("check special collection: %w", err)
	}
	if _, err := pool.Exec(ctx, "SELECT refresh_catalog_price_quality()"); err != nil {
		return fmt.Errorf("refresh catalog price quality: %w", err)
	}
	if _, err := pool.Exec(ctx, "SELECT refresh_market_variant_movements()"); err != nil {
		return fmt.Errorf("refresh market movement snapshots: %w", err)
	}

	logger.Info("JustTCG import complete",
		"sets", total.Sets,
		"cards", total.Cards,
		"variants", total.Variants,
		"observations", total.Observations,
	)
	return nil
}

func importMachampAliases(
	ctx context.Context,
	pool databasePool,
	filename string,
) (importStats, error) {
	file, err := os.Open(filename)
	if err != nil {
		return importStats{}, fmt.Errorf("open file: %w", err)
	}
	defer file.Close()

	var data specialCollection
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		return importStats{}, fmt.Errorf("decode JSON: %w", err)
	}
	if err := ensureJSONEnd(decoder); err != nil {
		return importStats{}, err
	}
	if !data.CollectionComplete {
		return importStats{}, errors.New("Machamp special collection is incomplete")
	}

	cardsByProduct := make(map[string]providerCard, len(data.Cards))
	for _, card := range data.Cards {
		if _, wanted := machampCardIDsByProduct[card.TCGPlayerID]; !wanted {
			continue
		}
		if _, duplicate := cardsByProduct[card.TCGPlayerID]; duplicate {
			return importStats{}, fmt.Errorf("duplicate Machamp product %s", card.TCGPlayerID)
		}
		cardsByProduct[card.TCGPlayerID] = card
	}
	for productID := range machampCardIDsByProduct {
		if _, ok := cardsByProduct[productID]; !ok {
			return importStats{}, fmt.Errorf("Machamp product %s is missing", productID)
		}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return importStats{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		CREATE TEMP TABLE import_machamp_observations (
			variant_id text NOT NULL,
			observed_on date NOT NULL,
			price numeric(12, 2) NOT NULL
		) ON COMMIT DROP
	`); err != nil {
		return importStats{}, fmt.Errorf("create Machamp observation staging table: %w", err)
	}

	stats := importStats{Cards: len(cardsByProduct)}
	priceRows := make([][]any, 0, len(cardsByProduct)*5*365)
	for productID, cardID := range machampCardIDsByProduct {
		card := cardsByProduct[productID]
		var storedProductID string
		if err := tx.QueryRow(ctx, `
			SELECT tcgplayer_product_id::text
			FROM catalog_cards
			WHERE id = $1
		`, cardID).Scan(&storedProductID); err != nil {
			return importStats{}, fmt.Errorf("find canonical Machamp %s: %w", cardID, err)
		}
		if storedProductID != productID {
			return importStats{}, fmt.Errorf(
				"canonical Machamp %s has TCGplayer ID %s, want %s",
				cardID,
				storedProductID,
				productID,
			)
		}

		seenConditions := make(map[string]struct{}, len(conditionCodes))
		for _, variant := range card.Variants {
			if variant.Printing != "1st Edition Holofoil" || variant.Language != "English" {
				continue
			}
			variantID, err := machampVariantID(productID, variant.Condition)
			if err != nil {
				return importStats{}, err
			}
			if _, duplicate := seenConditions[variant.Condition]; duplicate {
				return importStats{}, fmt.Errorf(
					"Machamp product %s has duplicate %s variant",
					productID,
					variant.Condition,
				)
			}
			seenConditions[variant.Condition] = struct{}{}

			command, err := tx.Exec(ctx, `
				UPDATE catalog_card_variants
				SET
					uuid = $3,
					tcgplayer_sku_id = $4,
					printing = $5,
					condition = $6,
					edition = 'First Edition',
					finish = 'Holofoil',
					language = 'English',
					current_price = $7,
					price_change_24h = $8,
					source_updated_at = $9,
					source_provider = 'JustTCG',
					imported_at = now()
				WHERE id = $1 AND card_id = $2
			`,
				variantID,
				cardID,
				nullIfEmpty(variant.UUID),
				parseInt64(variant.TCGPlayerSKUID),
				variant.Printing,
				variant.Condition,
				variant.Price,
				variant.PriceChange24Hour,
				parseUnixTime(variant.LastUpdated),
			)
			if err != nil {
				return importStats{}, fmt.Errorf("update Machamp variant %s: %w", variantID, err)
			}
			if command.RowsAffected() != 1 {
				return importStats{}, fmt.Errorf("canonical Machamp variant %s is missing", variantID)
			}
			stats.Variants++

			for _, point := range variant.PriceHistory {
				if point.Price == nil || *point.Price < 0 || point.Timestamp <= 0 {
					continue
				}
				priceRows = append(priceRows, []any{
					variantID,
					time.Unix(point.Timestamp, 0).UTC().Format(time.DateOnly),
					*point.Price,
				})
				stats.Observations++
			}
		}
		if len(seenConditions) != len(conditionCodes) {
			return importStats{}, fmt.Errorf(
				"Machamp product %s has %d conditions, want %d",
				productID,
				len(seenConditions),
				len(conditionCodes),
			)
		}
	}

	if _, err := tx.CopyFrom(
		ctx,
		pgx.Identifier{"import_machamp_observations"},
		[]string{"variant_id", "observed_on", "price"},
		pgx.CopyFromRows(priceRows),
	); err != nil {
		return importStats{}, fmt.Errorf("stage Machamp observations: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO price_observations (
			variant_id, observed_on, price, source_provider, imported_at
		)
		SELECT DISTINCT ON (variant_id, observed_on)
			variant_id, observed_on, price, 'JustTCG', now()
		FROM import_machamp_observations
		ORDER BY variant_id, observed_on
		ON CONFLICT (variant_id, observed_on) DO UPDATE SET
			price = EXCLUDED.price,
			source_provider = EXCLUDED.source_provider,
			imported_at = now()
	`); err != nil {
		return importStats{}, fmt.Errorf("merge Machamp observations: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return importStats{}, fmt.Errorf("commit Machamp import: %w", err)
	}
	return stats, nil
}

func machampVariantID(productID string, condition string) (string, error) {
	if _, ok := machampCardIDsByProduct[productID]; !ok {
		return "", fmt.Errorf("unsupported Machamp product %s", productID)
	}
	conditionCode, ok := conditionCodes[condition]
	if !ok {
		return "", fmt.Errorf("unsupported Machamp condition %q", condition)
	}
	return fmt.Sprintf(
		"curated-%s-first-edition-holofoil-%s",
		productID,
		conditionCode,
	), nil
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
	logoURL, symbolURL := pokemonTCGSetImages(data.Set.Name)
	setName := catalogSetName(data.Set.ID, data.Set.Name)

	if err := upsertCatalogSet(ctx, tx, catalogSet{
		ID:                data.Set.ID,
		Game:              valueOrDefault(data.Set.Game, "Pokemon"),
		Name:              setName,
		ReleaseDate:       releaseDate,
		DeclaredCount:     declaredCount,
		Provider:          valueOrDefault(data.Provider, "JustTCG"),
		SourceFile:        filepath.Base(filename),
		SourceCollectedAt: collectedAt,
		LogoURL:           logoURL,
		SymbolURL:         symbolURL,
		DisplayOrder:      catalogSetDisplayOrder(data.Set.ID),
	}); err != nil {
		return importStats{}, fmt.Errorf("upsert set: %w", err)
	}

	stats := importStats{Sets: 1}
	if data.Set.ID == baseSetShadowlessID {
		if err := upsertCatalogSet(ctx, tx, catalogSet{
			ID:                baseSetFirstEditionID,
			Game:              valueOrDefault(data.Set.Game, "Pokemon"),
			Name:              "Base Set First Edition",
			ReleaseDate:       releaseDate,
			DeclaredCount:     declaredCount,
			Provider:          valueOrDefault(data.Provider, "JustTCG"),
			SourceFile:        filepath.Base(filename),
			SourceCollectedAt: collectedAt,
			LogoURL:           logoURL,
			SymbolURL:         symbolURL,
			DisplayOrder:      catalogSetDisplayOrder(baseSetFirstEditionID),
		}); err != nil {
			return importStats{}, fmt.Errorf("upsert First Edition set: %w", err)
		}
		stats.Sets++
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
		if providerCardExcluded(card.ID) {
			continue
		}
		productID := parseInt64(card.TCGPlayerID)
		imageURL := tcgplayerImageURL(productID)

		if err := upsertCatalogCard(ctx, tx, card, card.ID, data.Set.ID, card.UUID, productID, imageURL); err != nil {
			return importStats{}, fmt.Errorf("upsert card %s: %w", card.ID, err)
		}
		stats.Cards++

		if data.Set.ID == baseSetShadowlessID && cardHasEdition(card, "First Edition") {
			firstEditionID := firstEditionCardID(card.ID)
			if err := upsertCatalogCard(ctx, tx, card, firstEditionID, baseSetFirstEditionID, "", productID, imageURL); err != nil {
				return importStats{}, fmt.Errorf("upsert First Edition card %s: %w", firstEditionID, err)
			}
			stats.Cards++
		}

		for _, variant := range card.Variants {
			if providerVariantExcluded(card.ID, variant.Printing) {
				continue
			}
			edition, finish := normalizePrinting(variant.Printing)
			targetCardID, storedEdition := catalogVariantTarget(data.Set.ID, card.ID, edition)
			_, err := tx.Exec(ctx, `
				INSERT INTO catalog_card_variants (
					id, uuid, card_id, tcgplayer_sku_id, printing, condition,
					edition, finish, language, current_price, price_change_24h,
					source_updated_at, imported_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
				ON CONFLICT (id) DO UPDATE SET
					uuid = EXCLUDED.uuid,
					card_id = EXCLUDED.card_id,
					tcgplayer_sku_id = EXCLUDED.tcgplayer_sku_id,
					printing = EXCLUDED.printing,
					condition = EXCLUDED.condition,
					edition = EXCLUDED.edition,
					finish = EXCLUDED.finish,
					language = EXCLUDED.language,
					current_price = EXCLUDED.current_price,
					price_change_24h = EXCLUDED.price_change_24h,
					source_updated_at = EXCLUDED.source_updated_at,
					imported_at = now()
			`, variant.ID, nullIfEmpty(variant.UUID), targetCardID, parseInt64(variant.TCGPlayerSKUID),
				valueOrDefault(variant.Printing, "Unknown"), valueOrDefault(variant.Condition, "Unknown"),
				storedEdition, finish, valueOrDefault(variant.Language, "Unknown"), variant.Price,
				variant.PriceChange24Hour, parseUnixTime(variant.LastUpdated))
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

type catalogSet struct {
	ID                string
	Game              string
	Name              string
	ReleaseDate       *string
	DeclaredCount     int
	Provider          string
	SourceFile        string
	SourceCollectedAt *time.Time
	LogoURL           string
	SymbolURL         string
	DisplayOrder      int
}

func upsertCatalogSet(ctx context.Context, tx pgx.Tx, set catalogSet) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO catalog_sets (
			id, game, name, release_date, declared_card_count, provider,
			source_file, source_collected_at, logo_url, symbol_url, display_order, imported_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
		ON CONFLICT (id) DO UPDATE SET
			game = EXCLUDED.game,
			name = EXCLUDED.name,
			release_date = EXCLUDED.release_date,
			declared_card_count = EXCLUDED.declared_card_count,
			provider = EXCLUDED.provider,
			source_file = EXCLUDED.source_file,
			source_collected_at = EXCLUDED.source_collected_at,
			logo_url = coalesce(EXCLUDED.logo_url, catalog_sets.logo_url),
			symbol_url = coalesce(EXCLUDED.symbol_url, catalog_sets.symbol_url),
			display_order = EXCLUDED.display_order,
			imported_at = now()
	`, set.ID, set.Game, set.Name, set.ReleaseDate, set.DeclaredCount, set.Provider,
		set.SourceFile, set.SourceCollectedAt, nullIfEmpty(set.LogoURL), nullIfEmpty(set.SymbolURL),
		set.DisplayOrder)
	return err
}

func upsertCatalogCard(
	ctx context.Context,
	tx pgx.Tx,
	card providerCard,
	cardID string,
	setID string,
	uuid string,
	productID *int64,
	imageURL string,
) error {
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
				image_url = COALESCE(catalog_cards.image_url, EXCLUDED.image_url),
				imported_at = now()
		`, cardID, nullIfEmpty(uuid), setID, productID, card.Name,
		nullIfEmpty(card.Number), numberSort(card.Number), nullIfEmpty(card.Rarity), nullIfEmpty(imageURL))
	return err
}

func tcgplayerImageURL(productID *int64) string {
	if productID == nil || *productID <= 0 {
		return ""
	}
	return fmt.Sprintf(
		"https://product-images.tcgplayer.com/fit-in/437x437/%d.jpg",
		*productID,
	)
}

func providerCardExcluded(cardID string) bool {
	_, excluded := excludedProviderCardIDs[cardID]
	return excluded
}

func providerVariantExcluded(cardID, printing string) bool {
	_, finish := normalizePrinting(printing)
	if finish != "Reverse Holofoil" {
		return false
	}
	// Aquapolis Crystal secret rares are holo-only. The provider has
	// intermittently exposed empty or mislabeled reverse-holo variants.
	_, crystal := map[string]struct{}{
		"pokemon-aquapolis-kingdra-148-secret-rare":  {},
		"pokemon-aquapolis-lugia-secret-rare":        {},
		"pokemon-aquapolis-nidoking-150-secret-rare": {},
	}[cardID]
	return crystal
}

func catalogSetName(setID, providerName string) string {
	if setID == baseSetShadowlessID {
		return "Base Set Shadowless"
	}
	return providerName
}

func catalogSetDisplayOrder(setID string) int {
	switch setID {
	case baseSetFirstEditionID:
		return 10
	case baseSetShadowlessID:
		return 20
	case baseSetID:
		return 30
	default:
		return 100
	}
}

func firstEditionCardID(cardID string) string {
	return strings.Replace(cardID, baseSetShadowlessPrefix, baseSetFirstPrefix, 1)
}

func cardHasEdition(card providerCard, wantedEdition string) bool {
	for _, variant := range card.Variants {
		edition, _ := normalizePrinting(variant.Printing)
		if edition == wantedEdition {
			return true
		}
	}
	return false
}

func catalogVariantTarget(setID, cardID, edition string) (string, string) {
	if setID != baseSetShadowlessID {
		return cardID, edition
	}
	if edition == "First Edition" {
		return firstEditionCardID(cardID), edition
	}
	return cardID, "Shadowless"
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

func normalizePrinting(printing string) (string, string) {
	normalized := strings.ToLower(strings.TrimSpace(printing))
	edition := "Unlimited"
	if strings.Contains(normalized, "1st edition") || strings.Contains(normalized, "first edition") {
		edition = "First Edition"
	}

	finish := "Normal"
	switch {
	case strings.Contains(normalized, "reverse holo"):
		finish = "Reverse Holofoil"
	case strings.Contains(normalized, "holo"):
		finish = "Holofoil"
	}
	return edition, finish
}

func pokemonTCGSetImages(setName string) (string, string) {
	if strings.TrimSpace(setName) == "Best of Promos" {
		return "", "https://images.pokemontcg.io/bp/symbol.png"
	}
	setID := map[string]string{
		"Base Set":                   "base1",
		"Base Set (Shadowless)":      "base1",
		"Jungle":                     "base2",
		"Fossil":                     "base3",
		"Base Set 2":                 "base4",
		"Team Rocket":                "base5",
		"Gym Heroes":                 "gym1",
		"Gym Challenge":              "gym2",
		"Neo Genesis":                "neo1",
		"Neo Discovery":              "neo2",
		"Southern Islands":           "si1",
		"Neo Revelation":             "neo3",
		"Neo Destiny":                "neo4",
		"Legendary Collection":       "base6",
		"WoTC Promo":                 "basep",
		"Expedition Base Set":        "ecard1",
		"Expedition":                 "ecard1",
		"Aquapolis":                  "ecard2",
		"Skyridge":                   "ecard3",
		"Wizards Black Star Promos":  "basep",
		"EX Ruby & Sapphire":         "ex1",
		"EX Ruby and Sapphire":       "ex1",
		"EX Sandstorm":               "ex2",
		"EX Dragon":                  "ex3",
		"EX Team Magma vs Team Aqua": "ex4",
		"EX Hidden Legends":          "ex5",
		"EX FireRed & LeafGreen":     "ex6",
		"EX Team Rocket Returns":     "ex7",
		"EX Deoxys":                  "ex8",
		"EX Emerald":                 "ex9",
		"EX Unseen Forces":           "ex10",
		"EX Delta Species":           "ex11",
		"EX Legend Maker":            "ex12",
		"EX Holon Phantoms":          "ex13",
		"EX Crystal Guardians":       "ex14",
		"EX Dragon Frontiers":        "ex15",
		"EX Power Keepers":           "ex16",
	}[strings.TrimSpace(setName)]
	if setID == "" {
		return "", ""
	}
	return fmt.Sprintf("https://images.pokemontcg.io/%s/logo.png", setID),
		fmt.Sprintf("https://images.pokemontcg.io/%s/symbol.png", setID)
}
