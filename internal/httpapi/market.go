package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/jackc/pgx/v5"
)

const (
	defaultMoverLimit    = 8
	defaultMovementLimit = 24
	maximumMovementLimit = 60
)

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
	edition, ok := marketEdition(r.URL.Query().Get("edition"))
	if !ok {
		writeError(w, http.StatusBadRequest, "edition is not supported")
		return
	}

	overview, err := api.market.Overview(r.Context(), market.OverviewFilter{
		Period:    period,
		Condition: condition,
		SetID:     r.URL.Query().Get("set_id"),
		Edition:   edition,
		Limit:     limit,
		Rank:      rank,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "market overview is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (api *API) marketMovements(w http.ResponseWriter, r *http.Request) {
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
	rank, ok := market.ParseRank(r.URL.Query().Get("rank"))
	if !ok {
		writeError(w, http.StatusBadRequest, "rank must be amount or percent")
		return
	}
	direction, ok := market.ParseDirection(r.URL.Query().Get("direction"))
	if !ok {
		writeError(w, http.StatusBadRequest, "direction must be all, gainers, or decliners")
		return
	}
	limit, ok := queryInteger(r, "limit", defaultMovementLimit, 1, maximumMovementLimit)
	if !ok {
		writeError(w, http.StatusBadRequest, "limit must be between 1 and 60")
		return
	}
	offset, ok := queryInteger(r, "offset", 0, 0, 1_000_000)
	if !ok {
		writeError(w, http.StatusBadRequest, "offset must be between 0 and 1000000")
		return
	}
	edition, ok := marketEdition(r.URL.Query().Get("edition"))
	if !ok {
		writeError(w, http.StatusBadRequest, "edition is not supported")
		return
	}

	page, err := api.market.Movements(r.Context(), market.MovementFilter{
		Period:    period,
		Condition: condition,
		SetID:     r.URL.Query().Get("set_id"),
		Edition:   edition,
		Query:     r.URL.Query().Get("q"),
		Direction: direction,
		Rank:      rank,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "market movements are unavailable")
		return
	}
	writeJSON(w, http.StatusOK, page)
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

func marketEdition(value string) (string, bool) {
	edition := strings.TrimSpace(value)
	return edition, optionalCatalogValue(edition, "Unlimited", "Shadowless", "First Edition")
}
