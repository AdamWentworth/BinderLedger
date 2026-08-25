package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

type healthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	BuildSHA string `json:"buildSha"`
}

func (api *API) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	response := healthResponse{
		Status:   "ok",
		Database: "ok",
		BuildSHA: valueOrDefault(os.Getenv("BINDERLEDGER_BUILD_SHA"), "development"),
	}
	status := http.StatusOK
	if err := api.db.Ping(ctx); err != nil {
		response.Status = "degraded"
		response.Database = "unavailable"
		status = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(response)
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
