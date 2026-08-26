package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/jackc/pgx/v5"
)

const defaultMoverLimit = 8

var marketConditions = map[string]struct{}{
	"Near Mint":         {},
	"Lightly Played":    {},
	"Moderately Played": {},
	"Heavily Played":    {},
	"Damaged":           {},
}

func (api *API) marketOverview(w http.ResponseWriter, r *http.Request) {
	period, ok := market.ParsePeriod(r.URL.Query().Get("period"))
	if !ok {
		writeError(w, http.StatusBadRequest, "period must be 1d, 1w, 1m, 1y, or all")
		return
	}
	condition, ok := marketCondition(r.URL.Query().Get("condition"))
	if !ok {
		writeError(w, http.StatusBadRequest, "condition is not supported")
		return
	}
	limit, ok := queryInteger(r, "limit", defaultMoverLimit, 1, 20)
	if !ok {
		writeError(w, http.StatusBadRequest, "limit must be between 1 and 20")
		return
	}
	rank, ok := market.ParseRank(r.URL.Query().Get("rank"))
	if !ok {
		writeError(w, http.StatusBadRequest, "rank must be amount or percent")
		return
	}

	overview, err := api.market.Overview(r.Context(), market.OverviewFilter{
		Period:    period,
		Condition: condition,
		SetID:     r.URL.Query().Get("set_id"),
		Limit:     limit,
		Rank:      rank,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "market overview is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (api *API) marketVariantHistory(w http.ResponseWriter, r *http.Request) {
	period, ok := market.ParsePeriod(r.URL.Query().Get("period"))
	if !ok {
		writeError(w, http.StatusBadRequest, "period must be 1d, 1w, 1m, 1y, or all")
		return
	}
	variantID := strings.TrimSpace(r.PathValue("variantID"))
	if variantID == "" || len(variantID) > 200 {
		writeError(w, http.StatusBadRequest, "variant id is invalid")
		return
	}

	history, err := api.market.VariantHistory(r.Context(), variantID, period)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "market variant was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "variant history is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, history)
}

func marketCondition(value string) (string, bool) {
	condition := strings.TrimSpace(value)
	if condition == "" {
		return "Near Mint", true
	}
	_, ok := marketConditions[condition]
	return condition, ok
}
