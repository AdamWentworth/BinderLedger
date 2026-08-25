package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maximumImageBytes  = 12 << 20
	minimumImageWidth  = 200
	minimumImageHeight = 250
	defaultDelay       = 500 * time.Millisecond
)

var trustedImageHosts = map[string]struct{}{
	"product-images.tcgplayer.com": {},
}

type target struct {
	CardID         string
	CardName       string
	ProductID      int64
	Edition        string
	Finish         string
	Language       string
	SourceImageURL string
}

type downloadedImage struct {
	Data      []byte
	Extension string
	SHA256    string
	Width     int
	Height    int
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(ctx, logger, os.Args[1:]); err != nil {
		logger.Error("card image sync failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger, args []string) error {
	flags := flag.NewFlagSet("sync-card-images", flag.ContinueOnError)
	setID := flags.String("set-id", "", "catalog set ID to synchronize")
	delay := flags.Duration("request-interval", defaultDelay, "minimum delay between image requests")
	dryRun := flags.Bool("dry-run", false, "report missing images without downloading them")
	if err := flags.Parse(args); err != nil {
		return err
	}
	*setID = strings.TrimSpace(*setID)
	if *setID == "" {
		return errors.New("-set-id is required")
	}
	if *delay < 100*time.Millisecond {
		return errors.New("-request-interval must be at least 100ms")
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

	targets, cardCount, err := findTargets(ctx, db, *setID)
	if err != nil {
		return err
	}
	logger.Info(
		"card image sync planned",
		"set_id", *setID,
		"catalog_cards", cardCount,
		"missing_images", len(targets),
		"dry_run", *dryRun,
	)
	if *dryRun || len(targets) == 0 {
		return nil
	}
	if err := os.MkdirAll(appConfig.CardImageDir, 0o750); err != nil {
		return fmt.Errorf("create card image directory: %w", err)
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many image redirects")
			}
			return validateSourceURL(request.URL.String())
		},
	}
	for index, item := range targets {
		if index > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(*delay):
			}
		}
		result, err := downloadWithRetry(ctx, client, item.SourceImageURL)
		if err != nil {
			return fmt.Errorf("download %s: %w", item.CardID, err)
		}
		filename := imageFilename(item, result.Extension)
		path := filepath.Join(appConfig.CardImageDir, filename)
		created, err := publishImage(path, result)
		if err != nil {
			return fmt.Errorf("publish %s: %w", item.CardID, err)
		}
		if err := registerImage(ctx, db, item, filename, result); err != nil {
			if created {
				_ = os.Remove(path)
			}
			return fmt.Errorf("register %s: %w", item.CardID, err)
		}
		logger.Info(
			"card image synchronized",
			"set_id", *setID,
			"card_id", item.CardID,
			"edition", item.Edition,
			"finish", item.Finish,
			"width", result.Width,
			"height", result.Height,
			"progress", fmt.Sprintf("%d/%d", index+1, len(targets)),
		)
	}

	logger.Info("card image sync complete", "set_id", *setID, "images_added", len(targets))
	return nil
}

func findTargets(ctx context.Context, db *pgxpool.Pool, setID string) ([]target, int, error) {
	var cardCount int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM catalog_cards WHERE set_id = $1`, setID).Scan(&cardCount); err != nil {
		return nil, 0, fmt.Errorf("count catalog cards: %w", err)
	}
	if cardCount == 0 {
		return nil, 0, fmt.Errorf("catalog set %q has no cards", setID)
	}

	var ambiguousCardID string
	err := db.QueryRow(ctx, `
		WITH printings AS (
			SELECT DISTINCT variant.card_id, variant.edition, variant.finish, variant.language
			FROM catalog_card_variants variant
			JOIN catalog_cards card ON card.id = variant.card_id
			WHERE card.set_id = $1
		)
		SELECT card_id
		FROM printings
		GROUP BY card_id
		HAVING count(*) <> 1
		ORDER BY card_id
		LIMIT 1
	`, setID).Scan(&ambiguousCardID)
	if err == nil {
		return nil, 0, fmt.Errorf(
			"card %s has multiple market printings; an exact image source is required",
			ambiguousCardID,
		)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, fmt.Errorf("validate printing coverage: %w", err)
	}

	rows, err := db.Query(ctx, `
		WITH printings AS (
			SELECT DISTINCT variant.card_id, variant.edition, variant.finish, variant.language
			FROM catalog_card_variants variant
			JOIN catalog_cards card ON card.id = variant.card_id
			WHERE card.set_id = $1
		)
		SELECT
			card.id,
			card.name,
			card.tcgplayer_product_id,
			printing.edition,
			printing.finish,
			printing.language,
			card.image_url
		FROM catalog_cards card
		JOIN printings printing ON printing.card_id = card.id
		WHERE card.set_id = $1
		  AND card.tcgplayer_product_id IS NOT NULL
		  AND card.image_url IS NOT NULL
		  AND btrim(card.image_url) <> ''
		  AND NOT EXISTS (
			  SELECT 1
			  FROM catalog_printing_images image
			  WHERE image.card_id = card.id
			    AND image.edition = printing.edition
			    AND image.finish = printing.finish
			    AND image.language = printing.language
		  )
		ORDER BY card.number_sort NULLS LAST, card.name
	`, setID)
	if err != nil {
		return nil, 0, fmt.Errorf("query missing card images: %w", err)
	}
	defer rows.Close()

	targets := make([]target, 0)
	for rows.Next() {
		var item target
		if err := rows.Scan(
			&item.CardID,
			&item.CardName,
			&item.ProductID,
			&item.Edition,
			&item.Finish,
			&item.Language,
			&item.SourceImageURL,
		); err != nil {
			return nil, 0, fmt.Errorf("scan image target: %w", err)
		}
		if err := validateSourceURL(item.SourceImageURL); err != nil {
			return nil, 0, fmt.Errorf("card %s image URL: %w", item.CardID, err)
		}
		targets = append(targets, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("image target rows: %w", err)
	}
	return targets, cardCount, nil
}

func validateSourceURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("parse URL: %w", err)
	}
	if parsed.Scheme != "https" {
		return errors.New("image URL must use HTTPS")
	}
	host := strings.ToLower(parsed.Hostname())
	if _, trusted := trustedImageHosts[host]; !trusted {
		return fmt.Errorf("image host %q is not trusted", host)
	}
	return nil
}

func download(ctx context.Context, client *http.Client, sourceURL string) (downloadedImage, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return downloadedImage{}, err
	}
	request.Header.Set("User-Agent", "BinderLedger/1.0 (+https://github.com/AdamWentworth/BinderLedger)")
	request.Header.Set("Accept", "image/jpeg,image/png")
	response, err := client.Do(request)
	if err != nil {
		return downloadedImage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return downloadedImage{}, fmt.Errorf("unexpected HTTP status %s", response.Status)
	}
	if response.ContentLength > maximumImageBytes {
		return downloadedImage{}, errors.New("image exceeds size limit")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maximumImageBytes+1))
	if err != nil {
		return downloadedImage{}, fmt.Errorf("read image: %w", err)
	}
	if len(data) > maximumImageBytes {
		return downloadedImage{}, errors.New("image exceeds size limit")
	}
	return inspectImage(data)
}

func downloadWithRetry(
	ctx context.Context,
	client *http.Client,
	sourceURL string,
) (downloadedImage, error) {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		result, err := download(ctx, client, sourceURL)
		if err == nil {
			return result, nil
		}
		lastErr = err
		if attempt == 3 {
			break
		}
		select {
		case <-ctx.Done():
			return downloadedImage{}, ctx.Err()
		case <-time.After(time.Duration(attempt) * time.Second):
		}
	}
	return downloadedImage{}, lastErr
}

func inspectImage(data []byte) (downloadedImage, error) {
	mimeType := http.DetectContentType(data)
	extension := ""
	switch mimeType {
	case "image/jpeg":
		extension = ".jpg"
	case "image/png":
		extension = ".png"
	default:
		return downloadedImage{}, fmt.Errorf("unsupported image type %q", mimeType)
	}
	configuration, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return downloadedImage{}, fmt.Errorf("decode image: %w", err)
	}
	if configuration.Width < minimumImageWidth || configuration.Height < minimumImageHeight {
		return downloadedImage{}, fmt.Errorf(
			"image dimensions %dx%d are too small",
			configuration.Width,
			configuration.Height,
		)
	}
	aspect := float64(configuration.Width) / float64(configuration.Height)
	if aspect < 0.55 || aspect > 0.85 {
		return downloadedImage{}, fmt.Errorf("image aspect ratio %.3f is not card-like", aspect)
	}
	digest := sha256.Sum256(data)
	return downloadedImage{
		Data:      data,
		Extension: extension,
		SHA256:    hex.EncodeToString(digest[:]),
		Width:     configuration.Width,
		Height:    configuration.Height,
	}, nil
}

func imageFilename(item target, extension string) string {
	return fmt.Sprintf(
		"%s--%s--%s--%s%s",
		slug(item.CardID),
		slug(item.Edition),
		slug(item.Finish),
		slug(item.Language),
		extension,
	)
}

func slug(value string) string {
	var builder strings.Builder
	separator := false
	for _, character := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsLetter(character) || unicode.IsDigit(character) {
			builder.WriteRune(character)
			separator = false
		} else if builder.Len() > 0 && !separator {
			builder.WriteByte('-')
			separator = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func publishImage(path string, result downloadedImage) (bool, error) {
	if existing, err := os.ReadFile(path); err == nil {
		digest := sha256.Sum256(existing)
		if hex.EncodeToString(digest[:]) != result.SHA256 {
			return false, errors.New("existing file has a different hash")
		}
		return false, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, err
	}

	temporary, err := os.CreateTemp(filepath.Dir(path), ".card-image-*")
	if err != nil {
		return false, err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o640); err != nil {
		temporary.Close()
		return false, err
	}
	if _, err := temporary.Write(result.Data); err != nil {
		temporary.Close()
		return false, err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return false, err
	}
	if err := temporary.Close(); err != nil {
		return false, err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return false, err
	}
	return true, nil
}

func registerImage(
	ctx context.Context,
	db *pgxpool.Pool,
	item target,
	filename string,
	result downloadedImage,
) error {
	pageURL := fmt.Sprintf("https://www.tcgplayer.com/product/%d", item.ProductID)
	_, err := db.Exec(ctx, `
		INSERT INTO catalog_printing_images (
			card_id, edition, finish, language, filename,
			source_name, source_page_url, source_image_url,
			sha256, width, height, verified_at, collected_at
		)
		VALUES ($1, $2, $3, $4, $5, 'TCGplayer', $6, $7, $8, $9, $10, now(), now())
		ON CONFLICT (card_id, edition, finish, language) DO NOTHING
	`,
		item.CardID,
		item.Edition,
		item.Finish,
		item.Language,
		filename,
		pageURL,
		item.SourceImageURL,
		result.SHA256,
		result.Width,
		result.Height,
	)
	return err
}
