package httpapi

import (
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5/pgxpool"
)

type API struct {
	db             *pgxpool.Pool
	allowedOrigins []string
}

func New(db *pgxpool.Pool, allowedOrigins []string) http.Handler {
	api := &API{db: db, allowedOrigins: allowedOrigins}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", api.health)

	return api.cors(mux)
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
