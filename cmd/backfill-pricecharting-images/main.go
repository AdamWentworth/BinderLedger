package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	htmltemplate "html/template"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/net/html"
)

const (
	priceChartingURL     = "https://www.pricecharting.com"
	defaultPageDelay     = 5 * time.Second
	minimumPageDelay     = 3 * time.Second
	defaultAssetDelay    = time.Second
	minimumAssetDelay    = 500 * time.Millisecond
	defaultDownloadLimit = 10
	minimumImageWidth    = 150
	minimumImageHeight   = 200
	maximumPageBytes     = 12 << 20
	maximumImageBytes    = 24 << 20
	userAgent            = "BinderLedger/0.1 (+https://github.com/AdamWentworth/BinderLedger)"
)

type targetSpec struct {
	Key         string
	SetID       string
	Editions    []string
	ConsolePath string
	CacheKey    string
}

var availableTargets = map[string]targetSpec{
	"base-first-edition": {
		Key:         "base-first-edition",
		SetID:       "base-set-first-edition-pokemon",
		Editions:    []string{"First Edition"},
		ConsolePath: "/console/pokemon-base-set?sort=model-number",
		CacheKey:    "base-shadowless",
	},
	"base-shadowless": {
		Key:         "base-shadowless",
		SetID:       "base-set-shadowless-pokemon",
		Editions:    []string{"Shadowless"},
		ConsolePath: "/console/pokemon-base-set?sort=model-number",
		CacheKey:    "base-shadowless",
	},
	"base-unlimited": {
		Key:         "base-unlimited",
		SetID:       "base-set-pokemon",
		Editions:    []string{"Unlimited", "First Edition"},
		ConsolePath: "/console/pokemon-base-set?sort=model-number",
		CacheKey:    "base-shadowless",
	},
	"jungle-unlimited": {
		Key:         "jungle-unlimited",
		SetID:       "jungle-pokemon",
		Editions:    []string{"Unlimited"},
		ConsolePath: "/console/pokemon-jungle?sort=model-number",
	},
	"fossil-unlimited": {
		Key:         "fossil-unlimited",
		SetID:       "fossil-pokemon",
		Editions:    []string{"Unlimited"},
		ConsolePath: "/console/pokemon-fossil?sort=model-number",
	},
	"team-rocket-unlimited": {
		Key:         "team-rocket-unlimited",
		SetID:       "team-rocket-pokemon",
		Editions:    []string{"Unlimited"},
		ConsolePath: "/console/pokemon-team-rocket?sort=model-number",
	},
}

var baseUnlimitedOverrides = map[string]product{
	"pokemon-base-set-machamp-first-edition-holo-rare": tcgplayerProduct(
		"Machamp [Later Stamped] #8", 8, "42425", "machamp",
	),
	"pokemon-base-set-computer-search-rare": tcgplayerProduct(
		"Computer Search #71", 71, "42417", "computer-search",
	),
	"pokemon-base-set-item-finder-rare": tcgplayerProduct(
		"Item Finder #74", 74, "42420", "item-finder",
	),
	"pokemon-base-set-lass-rare": tcgplayerProduct(
		"Lass #75", 75, "42421", "lass",
	),
	"pokemon-base-set-pokemon-trader-rare": tcgplayerProduct(
		"Pokemon Trader #77", 77, "108648", "pokemon-trader",
	),
	"pokemon-base-set-super-energy-removal-rare": tcgplayerProduct(
		"Super Energy Removal #79", 79, "42424", "super-energy-removal",
	),
}

type catalogTarget struct {
	CardID   string
	Name     string
	Number   int
	Edition  string
	Finish   string
	Language string
}

type product struct {
	Source   string
	Title    string
	PageURL  string
	ImageURL string
	Number   int
}

type indexPage struct {
	Products    []product
	NextCursor  string
	ReleaseDate string
}

type storedImage struct {
	Filename      string
	SourcePageURL string
	SHA256        string
	VerifiedAt    *time.Time
}

type galleryEntry struct {
	Target     string
	Name       string
	Number     int
	Edition    string
	Finish     string
	ImageURL   string
	Dimensions string
	Verified   bool
}

type galleryPage struct {
	Title       string
	Entries     []galleryEntry
	PageNumber  int
	PageCount   int
	PreviousURL string
	NextURL     string
}

type collector struct {
	httpClient    *http.Client
	cacheDir      string
	imageDir      string
	pageDelay     time.Duration
	assetDelay    time.Duration
	lastPageFetch time.Time
	lastAsset     time.Time
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(context.Background(), logger); err != nil {
		logger.Error("PriceCharting image backfill failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	targetNames := flag.String(
		"targets",
		"base-first-edition,base-shadowless,base-unlimited,jungle-unlimited,fossil-unlimited,team-rocket-unlimited",
		"comma-separated image target groups",
	)
	cacheDir := flag.String("cache-dir", "data/pricecharting-cache", "directory for cached index pages")
	pageDelay := flag.Duration("page-delay", defaultPageDelay, "minimum delay between PriceCharting page requests")
	assetDelay := flag.Duration("asset-delay", defaultAssetDelay, "minimum delay between image-host requests")
	limit := flag.Int("max", defaultDownloadLimit, "maximum new images to download; zero means all")
	refreshIndex := flag.Bool("refresh-index", false, "replace cached PriceCharting index pages")
	statusOnly := flag.Bool("status", false, "show collection status without network requests")
	galleryDir := flag.String("gallery-dir", "", "write paginated image-review HTML without network requests")
	approve := flag.Bool("approve", false, "mark every collected target image as visually verified")
	flag.Parse()

	if *pageDelay < minimumPageDelay {
		return fmt.Errorf("page-delay must be at least %s", minimumPageDelay)
	}
	if *assetDelay < minimumAssetDelay {
		return fmt.Errorf("asset-delay must be at least %s", minimumAssetDelay)
	}
	if *limit < 0 {
		return errors.New("max must not be negative")
	}

	specs, err := parseTargetSpecs(*targetNames)
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

	if *galleryDir != "" {
		return writeGallery(ctx, db, specs, appConfig.CardImageDir, *galleryDir)
	}
	if *approve {
		return approveTargets(ctx, logger, db, specs, appConfig.CardImageDir)
	}
	if *statusOnly {
		return logStatus(ctx, logger, db, specs)
	}
	if err := os.MkdirAll(appConfig.CardImageDir, 0o755); err != nil {
		return fmt.Errorf("create image directory: %w", err)
	}
	if err := os.MkdirAll(*cacheDir, 0o755); err != nil {
		return fmt.Errorf("create cache directory: %w", err)
	}

	c := &collector{
		httpClient: &http.Client{Timeout: 45 * time.Second},
		cacheDir:   *cacheDir,
		imageDir:   appConfig.CardImageDir,
		pageDelay:  *pageDelay,
		assetDelay: *assetDelay,
	}
	downloaded := 0
	failed := 0

	for _, spec := range specs {
		targets, err := loadCatalogTargets(ctx, db, spec)
		if err != nil {
			return err
		}
		products, err := c.discoverProducts(ctx, spec, *refreshIndex)
		if err != nil {
			return err
		}
		matches, err := matchTargets(spec, targets, products)
		if err != nil {
			return err
		}

		logger.Info(
			"matched printing images",
			"target", spec.Key,
			"catalog_cards", len(targets),
			"pricecharting_products", len(products),
		)
		for _, target := range targets {
			if *limit > 0 && downloaded >= *limit {
				logger.Info("download limit reached; progress is preserved", "downloaded", downloaded)
				return logStatus(ctx, logger, db, specs)
			}

			current, err := findStoredImage(ctx, db, target)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			matched := matches[target.CardID]
			if err == nil && current.SourcePageURL == matched.PageURL && c.storedImageValid(current) {
				continue
			}

			if err := c.collectImage(ctx, db, target, matched); err != nil {
				failed++
				logger.Error(
					"could not collect image; continuing",
					"card", target.Name,
					"number", target.Number,
					"target", spec.Key,
					"error", err,
				)
				continue
			}
			downloaded++
			logger.Info(
				"collected image for review",
				"card", target.Name,
				"number", target.Number,
				"target", spec.Key,
				"downloaded", downloaded,
			)
		}
	}

	logger.Info("PriceCharting image collection finished", "downloaded", downloaded, "failed", failed)
	return logStatus(ctx, logger, db, specs)
}

func parseTargetSpecs(value string) ([]targetSpec, error) {
	seen := make(map[string]bool)
	result := make([]targetSpec, 0, len(availableTargets))
	for _, name := range strings.Split(value, ",") {
		name = strings.TrimSpace(name)
		spec, ok := availableTargets[name]
		if !ok {
			return nil, fmt.Errorf("unknown target %q", name)
		}
		if !seen[name] {
			seen[name] = true
			result = append(result, spec)
		}
	}
	if len(result) == 0 {
		return nil, errors.New("at least one target is required")
	}
	return result, nil
}

func loadCatalogTargets(ctx context.Context, db *pgxpool.Pool, spec targetSpec) ([]catalogTarget, error) {
	rows, err := db.Query(ctx, `
		SELECT
			card.id,
			card.name,
			card.number_sort,
			quality.edition,
			quality.finish,
			quality.language
		FROM catalog_cards card
		JOIN catalog_price_quality quality ON quality.card_id = card.id
		WHERE card.set_id = $1
		  AND quality.edition = ANY($2)
		ORDER BY card.number_sort, card.name, quality.finish, quality.language
	`, spec.SetID, spec.Editions)
	if err != nil {
		return nil, fmt.Errorf("load %s catalog targets: %w", spec.Key, err)
	}
	defer rows.Close()

	var result []catalogTarget
	for rows.Next() {
		var target catalogTarget
		if err := rows.Scan(
			&target.CardID,
			&target.Name,
			&target.Number,
			&target.Edition,
			&target.Finish,
			&target.Language,
		); err != nil {
			return nil, err
		}
		result = append(result, target)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *collector) discoverProducts(ctx context.Context, spec targetSpec, refresh bool) ([]product, error) {
	var products []product
	cursor := ""
	releaseDate := ""
	seenCursors := make(map[string]bool)
	seenProducts := make(map[string]bool)

	for pageNumber := 0; pageNumber < 20; pageNumber++ {
		if seenCursors[cursor] {
			return nil, fmt.Errorf("%s index repeated cursor %q", spec.Key, cursor)
		}
		seenCursors[cursor] = true

		body, err := c.indexPage(ctx, spec, cursor, releaseDate, refresh)
		if err != nil {
			return nil, err
		}
		page, err := parseIndexPage(bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("parse %s index cursor %q: %w", spec.Key, cursor, err)
		}
		for _, item := range page.Products {
			if !productBelongsToTarget(spec, item) || seenProducts[item.PageURL] {
				continue
			}
			seenProducts[item.PageURL] = true
			products = append(products, item)
		}
		if page.NextCursor == "" {
			sort.Slice(products, func(i, j int) bool {
				if products[i].Number == products[j].Number {
					return products[i].Title < products[j].Title
				}
				return products[i].Number < products[j].Number
			})
			return products, nil
		}
		cursor = page.NextCursor
		if page.ReleaseDate != "" {
			releaseDate = page.ReleaseDate
		}
	}
	return nil, fmt.Errorf("%s index exceeded the 20-page safety limit", spec.Key)
}

func (c *collector) indexPage(
	ctx context.Context,
	spec targetSpec,
	cursor string,
	releaseDate string,
	refresh bool,
) ([]byte, error) {
	cacheKey := spec.CacheKey
	if cacheKey == "" {
		cacheKey = spec.Key
	}
	cacheName := cacheKey + "-cursor-" + cursor
	if cursor == "" {
		cacheName += "start"
	}
	cachePath := filepath.Join(c.cacheDir, cacheName+".html")
	if !refresh {
		if body, err := os.ReadFile(cachePath); err == nil {
			return body, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("read cached index: %w", err)
		}
	}

	if err := waitSince(ctx, c.lastPageFetch, c.pageDelay); err != nil {
		return nil, err
	}
	endpoint := priceChartingURL + spec.ConsolePath
	var request *http.Request
	var err error
	if cursor == "" {
		request, err = http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	} else {
		form := url.Values{
			"sort":         {"model-number"},
			"when":         {"none"},
			"release-date": {releaseDate},
			"cursor":       {cursor},
		}
		request, err = http.NewRequestWithContext(
			ctx,
			http.MethodPost,
			endpoint,
			strings.NewReader(form.Encode()),
		)
		if err == nil {
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
	}
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", userAgent)
	c.lastPageFetch = time.Now()
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch PriceCharting index: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("PriceCharting index returned %s", response.Status)
	}
	body, err := readLimited(response.Body, maximumPageBytes)
	if err != nil {
		return nil, err
	}
	if err := writeAtomic(cachePath, body, 0o644); err != nil {
		return nil, err
	}
	return body, nil
}

func parseIndexPage(reader io.Reader) (indexPage, error) {
	document, err := html.Parse(reader)
	if err != nil {
		return indexPage{}, err
	}
	var result indexPage
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "tr" {
			if item, ok := productFromRow(node); ok {
				result.Products = append(result.Products, item)
			}
		}
		if node.Type == html.ElementNode && node.Data == "form" && hasClass(node, "next_page") {
			result.NextCursor = inputValue(node, "cursor")
			result.ReleaseDate = inputValue(node, "release-date")
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(document)
	return result, nil
}

func productFromRow(row *html.Node) (product, bool) {
	titleCell := firstDescendant(row, func(node *html.Node) bool {
		return node.Type == html.ElementNode && node.Data == "td" && hasClass(node, "title")
	})
	imageCell := firstDescendant(row, func(node *html.Node) bool {
		return node.Type == html.ElementNode && node.Data == "td" && hasClass(node, "image")
	})
	if titleCell == nil || imageCell == nil {
		return product{}, false
	}
	link := firstDescendant(titleCell, func(node *html.Node) bool {
		return node.Type == html.ElementNode && node.Data == "a"
	})
	imageNode := firstDescendant(imageCell, func(node *html.Node) bool {
		return node.Type == html.ElementNode && node.Data == "img"
	})
	if link == nil || imageNode == nil {
		return product{}, false
	}
	title := strings.Join(strings.Fields(nodeText(link)), " ")
	pageURL := absoluteURL(attribute(link, "href"))
	imageURL := highResolutionImageURL(attribute(imageNode, "src"))
	number, ok := productNumber(title)
	if title == "" || pageURL == "" || imageURL == "" || !ok {
		return product{}, false
	}
	return product{
		Source:   "PriceCharting",
		Title:    title,
		PageURL:  pageURL,
		ImageURL: imageURL,
		Number:   number,
	}, true
}

func productBelongsToTarget(spec targetSpec, item product) bool {
	switch spec.Key {
	case "base-first-edition":
		return strings.Contains(item.Title, "[1st Edition]") ||
			item.Title == "Pikachu [1st Edition Red Cheeks] #58"
	case "base-shadowless":
		return strings.Contains(item.Title, "[Shadowless")
	case "base-unlimited":
		return !strings.Contains(item.Title, "[")
	case "jungle-unlimited", "fossil-unlimited":
		return !strings.Contains(item.Title, "[")
	case "team-rocket-unlimited":
		return !strings.Contains(item.Title, "[") || item.Title == "Dark Dragonite [Holo] #5"
	default:
		return false
	}
}

func matchTargets(
	spec targetSpec,
	targets []catalogTarget,
	products []product,
) (map[string]product, error) {
	byNumber := make(map[int][]product)
	for _, item := range products {
		byNumber[item.Number] = append(byNumber[item.Number], item)
	}
	result := make(map[string]product, len(targets))
	for _, target := range targets {
		if override, ok := baseUnlimitedOverrides[target.CardID]; spec.Key == "base-unlimited" && ok {
			result[target.CardID] = override
			continue
		}
		candidates := byNumber[target.Number]
		if (spec.Key == "base-shadowless" || spec.Key == "base-first-edition") && target.Number == 58 {
			wantsRedCheeks := strings.Contains(strings.ToLower(target.Name), "red cheeks")
			candidates = filterProducts(candidates, func(item product) bool {
				return strings.Contains(strings.ToLower(item.Title), "red cheeks") == wantsRedCheeks
			})
		}
		if spec.Key == "team-rocket-unlimited" && target.Number == 5 {
			candidates = filterProducts(candidates, func(item product) bool {
				return item.Title == "Dark Dragonite [Holo] #5"
			})
		}
		if len(candidates) != 1 {
			return nil, fmt.Errorf(
				"%s %s #%d matched %d PriceCharting products",
				spec.Key,
				target.Name,
				target.Number,
				len(candidates),
			)
		}
		result[target.CardID] = candidates[0]
	}
	return result, nil
}

func tcgplayerProduct(title string, number int, productID string, slug string) product {
	return product{
		Source:   "TCGplayer",
		Title:    title,
		PageURL:  "https://www.tcgplayer.com/product/" + productID + "/pokemon-base-set-" + slug,
		ImageURL: "https://product-images.tcgplayer.com/fit-in/437x437/" + productID + ".jpg",
		Number:   number,
	}
}

func filterProducts(items []product, keep func(product) bool) []product {
	result := make([]product, 0, len(items))
	for _, item := range items {
		if keep(item) {
			result = append(result, item)
		}
	}
	return result
}

func findStoredImage(ctx context.Context, db *pgxpool.Pool, target catalogTarget) (storedImage, error) {
	var image storedImage
	err := db.QueryRow(ctx, `
		SELECT filename, source_page_url, sha256, verified_at
		FROM catalog_printing_images
		WHERE card_id = $1 AND edition = $2 AND finish = $3 AND language = $4
	`, target.CardID, target.Edition, target.Finish, target.Language).Scan(
		&image.Filename,
		&image.SourcePageURL,
		&image.SHA256,
		&image.VerifiedAt,
	)
	return image, err
}

func (c *collector) storedImageValid(image storedImage) bool {
	path := filepath.Join(c.imageDir, image.Filename)
	body, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:]) == image.SHA256
}

func (c *collector) collectImage(
	ctx context.Context,
	db *pgxpool.Pool,
	target catalogTarget,
	item product,
) error {
	if err := waitSince(ctx, c.lastAsset, c.assetDelay); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, item.ImageURL, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", userAgent)
	c.lastAsset = time.Now()
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("download image: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("image host returned %s", response.Status)
	}
	body, err := readLimited(response.Body, maximumImageBytes)
	if err != nil {
		return err
	}
	configuration, format, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}
	if configuration.Width < minimumImageWidth ||
		configuration.Height < minimumImageHeight ||
		configuration.Width >= configuration.Height {
		return fmt.Errorf("unexpected card image dimensions %dx%d", configuration.Width, configuration.Height)
	}
	extension, err := imageExtension(format, response.Header.Get("Content-Type"))
	if err != nil {
		return err
	}
	filename := imageFilename(target, extension)
	path := filepath.Join(c.imageDir, filename)
	if err := writeAtomic(path, body, 0o644); err != nil {
		return err
	}
	sum := sha256.Sum256(body)
	sha := hex.EncodeToString(sum[:])

	_, err = db.Exec(ctx, `
		INSERT INTO catalog_printing_images (
			card_id,
			edition,
			finish,
			language,
			filename,
			source_name,
			source_page_url,
			source_image_url,
			sha256,
			width,
			height,
			verified_at,
			collected_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, now())
		ON CONFLICT (card_id, edition, finish, language) DO UPDATE SET
			filename = EXCLUDED.filename,
			source_name = EXCLUDED.source_name,
			source_page_url = EXCLUDED.source_page_url,
			source_image_url = EXCLUDED.source_image_url,
			sha256 = EXCLUDED.sha256,
			width = EXCLUDED.width,
			height = EXCLUDED.height,
			verified_at = CASE
				WHEN catalog_printing_images.sha256 = EXCLUDED.sha256
				THEN catalog_printing_images.verified_at
				ELSE NULL
			END,
			collected_at = now()
	`,
		target.CardID,
		target.Edition,
		target.Finish,
		target.Language,
		filename,
		item.Source,
		item.PageURL,
		item.ImageURL,
		sha,
		configuration.Width,
		configuration.Height,
	)
	if err != nil {
		return fmt.Errorf("save image metadata: %w", err)
	}
	return nil
}

func writeGallery(
	ctx context.Context,
	db *pgxpool.Pool,
	specs []targetSpec,
	imageDir string,
	galleryDir string,
) error {
	if err := os.MkdirAll(galleryDir, 0o755); err != nil {
		return fmt.Errorf("create gallery directory: %w", err)
	}
	absoluteImageDir, err := filepath.Abs(imageDir)
	if err != nil {
		return err
	}
	absoluteGalleryDir, err := filepath.Abs(galleryDir)
	if err != nil {
		return err
	}
	var entries []galleryEntry
	for _, spec := range specs {
		rows, err := db.Query(ctx, `
			SELECT
				card.name,
				card.number_sort,
				image.edition,
				image.finish,
				image.filename,
				image.width,
				image.height,
				image.verified_at IS NOT NULL
			FROM catalog_printing_images image
			JOIN catalog_cards card ON card.id = image.card_id
			WHERE card.set_id = $1 AND image.edition = ANY($2)
			ORDER BY card.number_sort, card.name, image.finish, image.language
		`, spec.SetID, spec.Editions)
		if err != nil {
			return err
		}
		for rows.Next() {
			var entry galleryEntry
			var filename string
			var width int
			var height int
			entry.Target = spec.Key
			if err := rows.Scan(
				&entry.Name,
				&entry.Number,
				&entry.Edition,
				&entry.Finish,
				&filename,
				&width,
				&height,
				&entry.Verified,
			); err != nil {
				rows.Close()
				return err
			}
			imagePath := filepath.Join(absoluteImageDir, filename)
			relativeImagePath, err := filepath.Rel(absoluteGalleryDir, imagePath)
			if err != nil {
				rows.Close()
				return err
			}
			entry.ImageURL = (&url.URL{Path: filepath.ToSlash(relativeImagePath)}).String()
			entry.Dimensions = fmt.Sprintf("%dx%d", width, height)
			entries = append(entries, entry)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
	}

	const entriesPerPage = 24
	pageCount := (len(entries) + entriesPerPage - 1) / entriesPerPage
	if pageCount == 0 {
		return errors.New("no collected images are available for review")
	}
	template, err := htmltemplate.New("gallery").Parse(galleryTemplate)
	if err != nil {
		return err
	}
	for pageIndex := 0; pageIndex < pageCount; pageIndex++ {
		start := pageIndex * entriesPerPage
		end := min(start+entriesPerPage, len(entries))
		page := galleryPage{
			Title:      "BinderLedger printing image review",
			Entries:    entries[start:end],
			PageNumber: pageIndex + 1,
			PageCount:  pageCount,
		}
		if pageIndex > 0 {
			page.PreviousURL = galleryFilename(pageIndex)
		}
		if pageIndex+1 < pageCount {
			page.NextURL = galleryFilename(pageIndex + 2)
		}
		var body bytes.Buffer
		if err := template.Execute(&body, page); err != nil {
			return err
		}
		if err := writeAtomic(filepath.Join(galleryDir, galleryFilename(pageIndex+1)), body.Bytes(), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func galleryFilename(pageNumber int) string {
	return fmt.Sprintf("page-%02d.html", pageNumber)
}

func approveTargets(
	ctx context.Context,
	logger *slog.Logger,
	db *pgxpool.Pool,
	specs []targetSpec,
	imageDir string,
) error {
	c := &collector{imageDir: imageDir}
	for _, spec := range specs {
		targets, err := loadCatalogTargets(ctx, db, spec)
		if err != nil {
			return err
		}
		for _, target := range targets {
			stored, err := findStoredImage(ctx, db, target)
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("cannot approve %s: %s #%d has no collected image", spec.Key, target.Name, target.Number)
			}
			if err != nil {
				return err
			}
			if !c.storedImageValid(stored) {
				return fmt.Errorf("cannot approve %s: %s #%d failed checksum validation", spec.Key, target.Name, target.Number)
			}
		}
		command, err := db.Exec(ctx, `
			UPDATE catalog_printing_images image
			SET verified_at = coalesce(image.verified_at, now())
			FROM catalog_cards card
			WHERE card.id = image.card_id
			  AND card.set_id = $1
			  AND image.edition = ANY($2)
		`, spec.SetID, spec.Editions)
		if err != nil {
			return err
		}
		logger.Info("approved printing images", "target", spec.Key, "images", command.RowsAffected())
	}
	return nil
}

func logStatus(
	ctx context.Context,
	logger *slog.Logger,
	db *pgxpool.Pool,
	specs []targetSpec,
) error {
	for _, spec := range specs {
		var catalogCount int
		var collectedCount int
		var verifiedCount int
		err := db.QueryRow(ctx, `
			SELECT
				count(DISTINCT (card.id, quality.edition, quality.finish, quality.language)),
				count(DISTINCT (image.card_id, image.edition, image.finish, image.language))
					FILTER (WHERE image.card_id IS NOT NULL),
				count(DISTINCT (image.card_id, image.edition, image.finish, image.language))
					FILTER (WHERE image.verified_at IS NOT NULL)
			FROM catalog_cards card
			JOIN catalog_price_quality quality ON quality.card_id = card.id
			LEFT JOIN catalog_printing_images image
				ON image.card_id = quality.card_id
				AND image.edition = quality.edition
				AND image.finish = quality.finish
				AND image.language = quality.language
			WHERE card.set_id = $1 AND quality.edition = ANY($2)
		`, spec.SetID, spec.Editions).Scan(&catalogCount, &collectedCount, &verifiedCount)
		if err != nil {
			return fmt.Errorf("load %s status: %w", spec.Key, err)
		}
		logger.Info(
			"image status",
			"target", spec.Key,
			"catalog", catalogCount,
			"collected", collectedCount,
			"verified", verifiedCount,
		)
	}
	return nil
}

func imageFilename(target catalogTarget, extension string) string {
	return strings.Join([]string{
		target.CardID,
		slug(target.Edition),
		slug(target.Finish),
		slug(target.Language),
	}, "--") + extension
}

func slug(value string) string {
	var result strings.Builder
	for _, character := range strings.ToLower(value) {
		if character >= 'a' && character <= 'z' || character >= '0' && character <= '9' {
			result.WriteRune(character)
		} else if result.Len() > 0 && !strings.HasSuffix(result.String(), "-") {
			result.WriteByte('-')
		}
	}
	return strings.Trim(result.String(), "-")
}

func imageExtension(format string, contentType string) (string, error) {
	switch strings.ToLower(format) {
	case "jpeg":
		return ".jpg", nil
	case "png":
		return ".png", nil
	}
	mediaType, _, _ := mime.ParseMediaType(contentType)
	return "", fmt.Errorf("unsupported image format %q (%s)", format, mediaType)
}

func highResolutionImageURL(value string) string {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme != "https" || parsed.Host != "storage.googleapis.com" {
		return ""
	}
	if !strings.HasPrefix(parsed.Path, "/images.pricecharting.com/") {
		return ""
	}
	pathParts := strings.Split(parsed.Path, "/")
	if len(pathParts) < 4 {
		return ""
	}
	pathParts[len(pathParts)-1] = "1600.jpg"
	parsed.Path = strings.Join(pathParts, "/")
	parsed.RawQuery = ""
	return parsed.String()
}

func absoluteURL(value string) string {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	if parsed.IsAbs() {
		if parsed.Scheme != "https" || parsed.Host != "www.pricecharting.com" {
			return ""
		}
		return parsed.String()
	}
	base, _ := url.Parse(priceChartingURL)
	return base.ResolveReference(parsed).String()
}

func productNumber(title string) (int, bool) {
	marker := strings.LastIndex(title, "#")
	if marker == -1 {
		return 0, false
	}
	digits := strings.TrimSpace(title[marker+1:])
	number, err := strconv.Atoi(digits)
	return number, err == nil
}

func inputValue(root *html.Node, name string) string {
	node := firstDescendant(root, func(node *html.Node) bool {
		return node.Type == html.ElementNode && node.Data == "input" && attribute(node, "name") == name
	})
	return attribute(node, "value")
}

func firstDescendant(root *html.Node, matches func(*html.Node) bool) *html.Node {
	for child := root.FirstChild; child != nil; child = child.NextSibling {
		if matches(child) {
			return child
		}
		if found := firstDescendant(child, matches); found != nil {
			return found
		}
	}
	return nil
}

func nodeText(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}
	var value strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		value.WriteString(nodeText(child))
	}
	return value.String()
}

func hasClass(node *html.Node, name string) bool {
	for _, className := range strings.Fields(attribute(node, "class")) {
		if className == name {
			return true
		}
	}
	return false
}

func attribute(node *html.Node, key string) string {
	if node == nil {
		return ""
	}
	for _, attribute := range node.Attr {
		if attribute.Key == key {
			return attribute.Val
		}
	}
	return ""
}

func waitSince(ctx context.Context, last time.Time, delay time.Duration) error {
	if last.IsZero() {
		return nil
	}
	remaining := delay - time.Since(last)
	if remaining <= 0 {
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

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("response exceeded %d bytes", limit)
	}
	return body, nil
}

func writeAtomic(path string, body []byte, mode os.FileMode) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".binderledger-image-*")
	if err != nil {
		return fmt.Errorf("create temporary file: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if _, err := temporary.Write(body); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Chmod(mode); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}

const galleryTemplate = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}} - {{.PageNumber}}/{{.PageCount}}</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #0f1713; color: #edf3ef; font: 14px system-ui, sans-serif; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
nav { display: flex; gap: 12px; align-items: center; }
a { color: #8bd7b5; }
.grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 18px; }
.entry { min-width: 0; padding: 10px; border: 1px solid #31453a; border-radius: 6px; background: #17221c; }
.entry img { display: block; width: 100%; aspect-ratio: 2.5 / 3.5; object-fit: contain; background: #0a0f0c; }
.name { margin-top: 8px; font-weight: 700; line-height: 1.25; }
.meta { margin-top: 3px; color: #aebdb5; font-size: 12px; line-height: 1.3; }
.verified { color: #8bd7b5; }
@media (max-width: 900px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
</head>
<body>
<header>
  <h1>{{.Title}}</h1>
  <nav>
    {{if .PreviousURL}}<a href="{{.PreviousURL}}">Previous</a>{{end}}
    <span>Page {{.PageNumber}} / {{.PageCount}}</span>
    {{if .NextURL}}<a href="{{.NextURL}}">Next</a>{{end}}
  </nav>
</header>
<main class="grid">
{{range .Entries}}
  <article class="entry">
    <img src="{{.ImageURL}}" alt="{{.Name}}">
    <div class="name">#{{.Number}} {{.Name}}</div>
    <div class="meta">{{.Target}} &middot; {{.Edition}} &middot; {{.Finish}}</div>
    <div class="meta{{if .Verified}} verified{{end}}">{{.Dimensions}}{{if .Verified}} &middot; verified{{else}} &middot; review pending{{end}}</div>
  </article>
{{end}}
</main>
</body>
</html>`
