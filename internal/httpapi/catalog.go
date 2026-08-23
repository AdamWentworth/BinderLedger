package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
)

const (
	defaultCardLimit = 24
	maximumCardLimit = 60
)

func (api *API) catalogSets(w http.ResponseWriter, r *http.Request) {
	sets, err := api.catalog.ListSets(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "catalog sets are unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sets": sets})
}

func (api *API) catalogCards(w http.ResponseWriter, r *http.Request) {
	limit, ok := queryInteger(r, "limit", defaultCardLimit, 1, maximumCardLimit)
	if !ok {
		writeError(w, http.StatusBadRequest, "limit must be between 1 and 60")
		return
	}
	offset, ok := queryInteger(r, "offset", 0, 0, 1_000_000)
	if !ok {
		writeError(w, http.StatusBadRequest, "offset must be a non-negative integer")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 100 {
		writeError(w, http.StatusBadRequest, "q must be 100 characters or fewer")
		return
	}

	page, err := api.catalog.ListCards(r.Context(), catalog.CardFilter{
		SetID:  r.URL.Query().Get("set_id"),
		Query:  query,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "catalog cards are unavailable")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func queryInteger(r *http.Request, key string, fallback, minimum, maximum int) (int, bool) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback, true
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum || parsed > maximum {
		return 0, false
	}
	return parsed, true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
