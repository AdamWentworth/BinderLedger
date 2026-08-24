package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestMachampTargetsAreExactAndUnique(t *testing.T) {
	targets := machampTargets()
	if len(targets) != 10 {
		t.Fatalf("len(machampTargets()) = %d, want 10", len(targets))
	}

	seen := make(map[string]bool)
	productCounts := make(map[int64]int)
	for _, target := range targets {
		if seen[target.Key] {
			t.Fatalf("duplicate target key %q", target.Key)
		}
		seen[target.Key] = true
		productCounts[target.TCGPlayerProductID]++
		if target.Printing != historyPrinting {
			t.Fatalf("target %q printing = %q", target.Key, target.Printing)
		}
	}

	if productCounts[107004] != 5 || productCounts[42425] != 5 {
		t.Fatalf("product target counts = %#v", productCounts)
	}
}

func TestValidateHistoryPoint(t *testing.T) {
	average := 12.34
	sales := 2
	target := machampTargets()[0]
	point := historyPoint{
		Date:      "2026-08-23",
		Source:    "tcgplayer",
		Currency:  "USD",
		Condition: target.Condition,
		Variant:   target.Printing,
		Average:   &average,
		SaleCount: &sales,
	}
	if err := validateHistoryPoint(target, point); err != nil {
		t.Fatalf("validateHistoryPoint() error = %v", err)
	}

	point.Condition = "Damaged"
	if err := validateHistoryPoint(target, point); err == nil {
		t.Fatal("validateHistoryPoint() accepted a mismatched condition")
	}
}

func TestHeaderInteger(t *testing.T) {
	headers := make(http.Header)
	headers.Set("X-Credits-Charged", "40")
	if got := headerInteger(headers, "X-Credits-Charged", 0); got != 40 {
		t.Fatalf("headerInteger() = %d, want 40", got)
	}
	if got := headerInteger(headers, "Missing", 7); got != 7 {
		t.Fatalf("headerInteger() fallback = %d, want 7", got)
	}
}

func TestBooleanEnvironment(t *testing.T) {
	t.Setenv("TEST_BOOLEAN_ENVIRONMENT", "true")
	got, err := booleanEnvironment("TEST_BOOLEAN_ENVIRONMENT", false)
	if err != nil || !got {
		t.Fatalf("booleanEnvironment() = (%v, %v), want (true, nil)", got, err)
	}

	os.Unsetenv("TEST_BOOLEAN_ENVIRONMENT")
	got, err = booleanEnvironment("TEST_BOOLEAN_ENVIRONMENT", false)
	if err != nil || got {
		t.Fatalf("booleanEnvironment() fallback = (%v, %v), want (false, nil)", got, err)
	}
}

func TestHistoryDoesNotRetryForbidden(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests++
		if request.Header.Get("X-API-Key") != "test-key" {
			http.Error(response, "missing API key", http.StatusUnauthorized)
			return
		}
		response.WriteHeader(http.StatusForbidden)
		_, _ = response.Write([]byte(`{"error":{"message":"Price history requires Pro or higher"}}`))
	}))
	defer server.Close()

	client := &pkmnPricesClient{
		apiKey:     "test-key",
		baseURL:    server.URL,
		httpClient: server.Client(),
	}
	_, err := client.history(context.Background(), machampTargets()[0], historyPageSize)
	if err == nil || !strings.Contains(err.Error(), "requires Pro") {
		t.Fatalf("history() error = %v, want Pro plan error", err)
	}
	if requests != 1 {
		t.Fatalf("history() made %d requests, want 1", requests)
	}
}
