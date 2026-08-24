package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/scan"
)

const (
	maximumScanRequestBytes = 25 * 1024 * 1024
	maximumScanMemoryBytes  = 2 * 1024 * 1024
)

func (api *API) scanCreate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maximumScanRequestBytes)
	if err := r.ParseMultipartForm(maximumScanMemoryBytes); err != nil {
		var maximumBytesError *http.MaxBytesError
		if errors.As(err, &maximumBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "scan images exceed the 25 MB upload limit")
			return
		}
		writeError(w, http.StatusBadRequest, "scan upload must be multipart form data")
		return
	}
	defer r.MultipartForm.RemoveAll()

	platform := strings.ToLower(strings.TrimSpace(r.FormValue("platform")))
	if platform == "" {
		platform = "unknown"
	}
	if !validScanPlatform(platform) {
		writeError(w, http.StatusBadRequest, "platform must be android, ios, web, or unknown")
		return
	}
	purpose := strings.ToLower(strings.TrimSpace(r.FormValue("purpose")))
	if purpose == "" {
		purpose = "identify"
	}
	if !validScanPurpose(purpose) {
		writeError(w, http.StatusBadRequest, "purpose must be identify or condition")
		return
	}

	front, frontHeader, err := r.FormFile("front")
	if err != nil {
		writeError(w, http.StatusBadRequest, "front image is required")
		return
	}
	defer front.Close()
	uploads := []scan.Upload{{Side: "front", Reader: front}}
	if frontHeader.Size > scan.MaxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "each scan image must be 12 MB or smaller")
		return
	}

	back, backHeader, err := r.FormFile("back")
	if err != nil && !errors.Is(err, http.ErrMissingFile) {
		writeError(w, http.StatusBadRequest, "back image is invalid")
		return
	}
	if err == nil {
		defer back.Close()
		if backHeader.Size > scan.MaxImageBytes {
			writeError(w, http.StatusRequestEntityTooLarge, "each scan image must be 12 MB or smaller")
			return
		}
		uploads = append(uploads, scan.Upload{Side: "back", Reader: back})
	}

	session, err := api.scans.Create(r.Context(), purpose, platform, uploads)
	if errors.Is(err, scan.ErrImageTooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, "each scan image must be 12 MB or smaller")
		return
	}
	if errors.Is(err, scan.ErrUnsupportedImage) {
		writeError(w, http.StatusUnsupportedMediaType, "scan images must be valid JPEG or PNG files")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan could not be stored")
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (api *API) scanGet(w http.ResponseWriter, r *http.Request) {
	scanID := strings.TrimSpace(r.PathValue("scanID"))
	if !validScanID(scanID) {
		writeError(w, http.StatusBadRequest, "scan id is invalid")
		return
	}
	session, err := api.scans.Get(r.Context(), scanID)
	if errors.Is(err, scan.ErrSessionNotFound) {
		writeError(w, http.StatusNotFound, "scan was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (api *API) scanConfirm(w http.ResponseWriter, r *http.Request) {
	scanID := strings.TrimSpace(r.PathValue("scanID"))
	if !validScanID(scanID) {
		writeError(w, http.StatusBadRequest, "scan id is invalid")
		return
	}

	var request struct {
		Decision      string `json:"decision"`
		CandidateRank *int   `json:"candidateRank"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "confirmation body is invalid")
		return
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "confirmation body must contain one JSON value")
		return
	}

	request.Decision = strings.ToLower(strings.TrimSpace(request.Decision))
	if request.Decision == "confirmed" {
		if request.CandidateRank == nil || *request.CandidateRank < 1 || *request.CandidateRank > 3 {
			writeError(w, http.StatusBadRequest, "confirmed scans require a candidate rank from 1 to 3")
			return
		}
	} else if request.Decision == "rejected" {
		if request.CandidateRank != nil {
			writeError(w, http.StatusBadRequest, "rejected scans must not include a candidate rank")
			return
		}
	} else {
		writeError(w, http.StatusBadRequest, "decision must be confirmed or rejected")
		return
	}

	session, err := api.scans.Confirm(r.Context(), scanID, scan.ConfirmationInput{
		Decision:      request.Decision,
		CandidateRank: request.CandidateRank,
	})
	if errors.Is(err, scan.ErrSessionNotFound) {
		writeError(w, http.StatusNotFound, "scan was not found")
		return
	}
	if errors.Is(err, scan.ErrScanNotComplete) {
		writeError(w, http.StatusConflict, "scan recognition is not complete")
		return
	}
	if errors.Is(err, scan.ErrCandidateNotFound) {
		writeError(w, http.StatusNotFound, "scan candidate was not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan confirmation could not be stored")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func validScanPlatform(value string) bool {
	return value == "android" || value == "ios" || value == "web" || value == "unknown"
}

func validScanPurpose(value string) bool {
	return value == "identify" || value == "condition"
}

func validScanID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if character != '-' {
				return false
			}
			continue
		}
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return false
		}
	}
	return true
}
