package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDatabaseBackedReadRoutes(t *testing.T) {
	databaseURL := os.Getenv("BINDERLEDGER_INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("BINDERLEDGER_INTEGRATION_DATABASE_URL is not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("pgxpool.New() error = %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("Ping() error = %v", err)
	}

	handler := New(pool, nil, t.TempDir(), t.TempDir())
	for _, path := range []string{
		"/api/health",
		"/api/catalog/sets",
		"/api/catalog/cards",
		"/api/catalog/listings",
		"/api/market/overview",
		"/api/market/overview?edition=First%20Edition",
		"/api/market/movements",
		"/api/market/movements?edition=Unlimited",
		"/api/watchlists/default",
		"/api/watchlists/default/items",
	} {
		t.Run(path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, path, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("GET %s status = %d, body = %s", path, response.Code, response.Body.String())
			}
			if !json.Valid(response.Body.Bytes()) {
				t.Fatalf("GET %s returned invalid JSON: %s", path, response.Body.String())
			}
		})
	}
}
