package httpapi

import (
	"errors"
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

	front, frontHeader, err := r.FormFile("front")
	if err != nil {
		writeError(w, http.StatusBadRequest, "front image is required")
		return
	}
	defer front.Close()
	back, backHeader, err := r.FormFile("back")
	if err != nil {
		writeError(w, http.StatusBadRequest, "back image is required")
		return
	}
	defer back.Close()
	if frontHeader.Size > scan.MaxImageBytes || backHeader.Size > scan.MaxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "each scan image must be 12 MB or smaller")
		return
	}

	session, err := api.scans.Create(r.Context(), platform, []scan.Upload{
		{Side: "front", Reader: front},
		{Side: "back", Reader: back},
	})
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

func validScanPlatform(value string) bool {
	return value == "android" || value == "ios" || value == "web" || value == "unknown"
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
