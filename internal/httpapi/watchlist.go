package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/AdamWentworth/BinderLedger/internal/market"
	"github.com/AdamWentworth/BinderLedger/internal/watchlist"
)

const maximumWatchlistBodyBytes = 4 * 1024

func (api *API) watchlistMemberships(w http.ResponseWriter, r *http.Request) {
	watchlistID, ok := watchlistPathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist id is invalid")
		return
	}
	memberships, err := api.watchlists.Memberships(r.Context(), watchlistID)
	if errors.Is(err, watchlist.ErrWatchlistNotFound) {
		writeError(w, http.StatusNotFound, "watchlist was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "watchlist items are unavailable")
		return
	}
	writeJSON(w, http.StatusOK, memberships)
}

func (api *API) watchlistOverview(w http.ResponseWriter, r *http.Request) {
	watchlistID, ok := watchlistPathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist id is invalid")
		return
	}
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

	overview, err := api.watchlists.Overview(r.Context(), watchlist.Filter{
		WatchlistID: watchlistID,
		Condition:   condition,
		Period:      period,
	})
	if errors.Is(err, watchlist.ErrWatchlistNotFound) {
		writeError(w, http.StatusNotFound, "watchlist was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "watchlist is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (api *API) watchlistAddCard(w http.ResponseWriter, r *http.Request) {
	watchlistID, ok := watchlistPathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist id is invalid")
		return
	}
	var target watchlist.CardTarget
	if !decodeWatchlistBody(w, r, &target) {
		return
	}
	target.CardID = strings.TrimSpace(target.CardID)
	target.Edition = strings.TrimSpace(target.Edition)
	target.Finish = strings.TrimSpace(target.Finish)
	target.Language = strings.TrimSpace(target.Language)
	if !validWatchlistCardTarget(target) {
		writeError(w, http.StatusBadRequest, "card printing is invalid")
		return
	}

	membership, created, err := api.watchlists.AddCard(r.Context(), watchlistID, target)
	if errors.Is(err, watchlist.ErrWatchlistNotFound) {
		writeError(w, http.StatusNotFound, "watchlist was not found")
		return
	}
	if errors.Is(err, watchlist.ErrCardPrintingMissing) {
		writeError(w, http.StatusNotFound, "card printing was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "card could not be watched")
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, membership)
}

func (api *API) watchlistRemoveCard(w http.ResponseWriter, r *http.Request) {
	watchlistID, itemID, ok := watchlistItemPath(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist item is invalid")
		return
	}
	removed, err := api.watchlists.RemoveCard(r.Context(), watchlistID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "watched card could not be removed")
		return
	}
	if !removed {
		writeError(w, http.StatusNotFound, "watched card was not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (api *API) watchlistAddSet(w http.ResponseWriter, r *http.Request) {
	watchlistID, ok := watchlistPathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist id is invalid")
		return
	}
	var target watchlist.SetTarget
	if !decodeWatchlistBody(w, r, &target) {
		return
	}
	target.SetID = strings.TrimSpace(target.SetID)
	target.Edition = strings.TrimSpace(target.Edition)
	if !validWatchlistSetTarget(target) {
		writeError(w, http.StatusBadRequest, "set edition is invalid")
		return
	}

	membership, created, err := api.watchlists.AddSet(r.Context(), watchlistID, target)
	if errors.Is(err, watchlist.ErrWatchlistNotFound) {
		writeError(w, http.StatusNotFound, "watchlist was not found")
		return
	}
	if errors.Is(err, watchlist.ErrSetEditionMissing) {
		writeError(w, http.StatusNotFound, "set edition was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "set could not be watched")
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, membership)
}

func (api *API) watchlistRemoveSet(w http.ResponseWriter, r *http.Request) {
	watchlistID, itemID, ok := watchlistItemPath(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "watchlist item is invalid")
		return
	}
	removed, err := api.watchlists.RemoveSet(r.Context(), watchlistID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "watched set could not be removed")
		return
	}
	if !removed {
		writeError(w, http.StatusNotFound, "watched set was not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func decodeWatchlistBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maximumWatchlistBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "request body is invalid")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "request body must contain one JSON value")
		return false
	}
	return true
}

func watchlistPathID(r *http.Request) (string, bool) {
	value := strings.TrimSpace(r.PathValue("watchlistID"))
	if value == "" || len(value) > 100 {
		return "", false
	}
	for _, character := range value {
		if !unicode.IsLetter(character) && !unicode.IsDigit(character) && character != '-' && character != '_' {
			return "", false
		}
	}
	return value, true
}

func watchlistItemPath(r *http.Request) (string, int64, bool) {
	watchlistID, ok := watchlistPathID(r)
	if !ok {
		return "", 0, false
	}
	itemID, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("itemID")), 10, 64)
	if err != nil || itemID <= 0 {
		return "", 0, false
	}
	return watchlistID, itemID, true
}

func validWatchlistCardTarget(target watchlist.CardTarget) bool {
	return target.CardID != "" && len(target.CardID) <= 200 &&
		requiredCatalogValue(target.Edition, "Unlimited", "Shadowless", "First Edition") &&
		requiredCatalogValue(target.Finish, "Normal", "Holofoil", "Reverse Holofoil") &&
		target.Language == "English"
}

func validWatchlistSetTarget(target watchlist.SetTarget) bool {
	return target.SetID != "" && len(target.SetID) <= 200 &&
		requiredCatalogValue(target.Edition, "Unlimited", "Shadowless", "First Edition")
}

func requiredCatalogValue(value string, allowed ...string) bool {
	return value != "" && optionalCatalogValue(value, allowed...)
}
