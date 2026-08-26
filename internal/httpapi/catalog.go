package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/jackc/pgx/v5"
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

func (api *API) catalogListings(w http.ResponseWriter, r *http.Request) {
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
	edition := strings.TrimSpace(r.URL.Query().Get("edition"))
	if !optionalCatalogValue(edition, "Unlimited", "Shadowless", "First Edition") {
		writeError(w, http.StatusBadRequest, "edition is not supported")
		return
	}
	finish := strings.TrimSpace(r.URL.Query().Get("finish"))
	if !optionalCatalogValue(finish, "Normal", "Holofoil", "Reverse Holofoil") {
		writeError(w, http.StatusBadRequest, "finish is not supported")
		return
	}
	variantID := strings.TrimSpace(r.URL.Query().Get("variant_id"))
	if len(variantID) > 200 {
		writeError(w, http.StatusBadRequest, "variant_id must be 200 characters or fewer")
		return
	}
	condition, ok := marketCondition(r.URL.Query().Get("condition"))
	if !ok {
		writeError(w, http.StatusBadRequest, "condition is not supported")
		return
	}
	gradedOnly, ok := queryBoolean(r, "graded_only", false)
	if !ok {
		writeError(w, http.StatusBadRequest, "graded_only must be true or false")
		return
	}
	sortValue, ok := catalog.ParseListingSort(r.URL.Query().Get("sort"))
	if !ok {
		writeError(w, http.StatusBadRequest, "sort is not supported")
		return
	}

	page, err := api.catalog.ListListings(r.Context(), catalog.ListingFilter{
		SetID:      r.URL.Query().Get("set_id"),
		Query:      query,
		Edition:    edition,
		Finish:     finish,
		VariantID:  variantID,
		GradedOnly: gradedOnly,
		Condition:  condition,
		Sort:       sortValue,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "catalog listings are unavailable")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (api *API) catalogSetPricing(w http.ResponseWriter, r *http.Request) {
	setID := strings.TrimSpace(r.PathValue("setID"))
	if setID == "" || len(setID) > 200 {
		writeError(w, http.StatusBadRequest, "set id is invalid")
		return
	}
	edition := strings.TrimSpace(r.URL.Query().Get("edition"))
	if len(edition) > 50 {
		writeError(w, http.StatusBadRequest, "edition is invalid")
		return
	}
	condition, ok := marketCondition(r.URL.Query().Get("condition"))
	if !ok {
		writeError(w, http.StatusBadRequest, "condition is not supported")
		return
	}
	period, ok := market.ParsePeriod(r.URL.Query().Get("period"))
	if !ok {
		writeError(w, http.StatusBadRequest, "period must be 1d, 1w, 1m, 1y, or all")
		return
	}

	pricing, err := api.catalog.SetPricing(r.Context(), catalog.SetPricingFilter{
		SetID:     setID,
		Edition:   edition,
		Condition: condition,
		Period:    period,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "catalog set was not found")
		return
	}
	if errors.Is(err, catalog.ErrEditionUnavailable) {
		writeError(w, http.StatusBadRequest, "edition is unavailable for this set")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "set pricing is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, pricing)
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

func queryBoolean(r *http.Request, key string, fallback bool) (bool, bool) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback, true
	}
	if value == "true" {
		return true, true
	}
	if value == "false" {
		return false, true
	}
	return false, false
}

func optionalCatalogValue(value string, allowed ...string) bool {
	if value == "" {
		return true
	}
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
