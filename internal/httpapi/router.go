package httpapi

import (
	"net/http"
	"path/filepath"
	"slices"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/AdamWentworth/BinderLedger/internal/scan"
	"github.com/AdamWentworth/BinderLedger/internal/watchlist"
	"github.com/jackc/pgx/v5/pgxpool"
)

type API struct {
	db             *pgxpool.Pool
	catalog        *catalog.Repository
	market         *market.Repository
	watchlists     *watchlist.Repository
	scans          scan.Store
	allowedOrigins []string
}

func New(db *pgxpool.Pool, allowedOrigins []string, cardImageDir, scanImageDir string) http.Handler {
	api := &API{
		db:             db,
		catalog:        catalog.NewRepository(db),
		market:         market.NewRepository(db),
		watchlists:     watchlist.NewRepository(db),
		scans:          scan.NewRepository(db, scanImageDir),
		allowedOrigins: allowedOrigins,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", api.health)
	mux.HandleFunc("GET /api/catalog/sets", api.catalogSets)
	mux.HandleFunc("GET /api/catalog/sets/{setID}/pricing", api.catalogSetPricing)
	mux.HandleFunc("GET /api/catalog/cards", api.catalogCards)
	mux.HandleFunc("GET /api/catalog/listings", api.catalogListings)
	mux.HandleFunc("GET /api/catalog/images/{filename}", cardImage(cardImageDir))
	mux.HandleFunc("GET /api/market/overview", api.marketOverview)
	mux.HandleFunc("GET /api/market/variants/{variantID}/history", api.marketVariantHistory)
	mux.HandleFunc("GET /api/watchlists/{watchlistID}", api.watchlistOverview)
	mux.HandleFunc("GET /api/watchlists/{watchlistID}/items", api.watchlistMemberships)
	mux.HandleFunc("POST /api/watchlists/{watchlistID}/cards", api.watchlistAddCard)
	mux.HandleFunc("DELETE /api/watchlists/{watchlistID}/cards/{itemID}", api.watchlistRemoveCard)
	mux.HandleFunc("POST /api/watchlists/{watchlistID}/sets", api.watchlistAddSet)
	mux.HandleFunc("DELETE /api/watchlists/{watchlistID}/sets/{itemID}", api.watchlistRemoveSet)
	mux.HandleFunc("POST /api/scans", api.scanCreate)
	mux.HandleFunc("GET /api/scans/{scanID}", api.scanGet)

	return api.cors(mux)
}

func cardImage(directory string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filename := r.PathValue("filename")
		if filename == "" || filename != filepath.Base(filename) || strings.Contains(filename, "\\") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, filepath.Join(directory, filename))
	}
}

func (api *API) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(api.allowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
