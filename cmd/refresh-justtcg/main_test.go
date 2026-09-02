package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTargetLookupsPreferStableUUID(t *testing.T) {
	uuid := "23edc8d4-b6b7-5d0c-a5fa-659040d24a7c"
	productID := "219042"
	lookups := targetLookups([]refreshTarget{
		{CardID: "regular", ProviderUUID: &uuid, TCGPlayerProductID: &productID},
		{CardID: "special", TCGPlayerProductID: &productID},
	})

	if len(lookups) != 2 {
		t.Fatalf("got %d lookups, want 2", len(lookups))
	}
	if lookups[0].CardID != uuid || lookups[0].TCGPlayerID != "" {
		t.Fatalf("first lookup = %#v, want UUID lookup", lookups[0])
	}
	if lookups[1].TCGPlayerID != productID || lookups[1].CardID != "" {
		t.Fatalf("second lookup = %#v, want TCGplayer lookup", lookups[1])
	}
}

func TestClientBatchUsesOfficialV1BatchShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/cards" {
			t.Errorf("request = %s %s, want POST /cards", request.Method, request.URL.Path)
		}
		if got := request.Header.Get("x-api-key"); got != "test-key" {
			t.Errorf("x-api-key = %q, want test-key", got)
		}
		if got := request.URL.Query().Get("include_price_history"); got != "true" {
			t.Errorf("include_price_history = %q, want true", got)
		}
		if got := request.URL.Query().Get("priceHistoryDuration"); got != "30d" {
			t.Errorf("priceHistoryDuration = %q, want 30d", got)
		}
		var body []map[string]string
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if len(body) != 1 || body[0]["cardId"] != "card-uuid" {
			t.Fatalf("request body = %#v", body)
		}
		if _, ok := body[0]["include_price_history"]; ok {
			t.Fatalf("batch lookup unexpectedly contains include_price_history: %#v", body[0])
		}

		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"data":[{"id":"card-slug","uuid":"card-uuid","tcgplayerId":"42","variants":[{
				"id":"variant-id","price":12.5,"priceHistory":[{"p":11.5,"t":1780272000}]
			}]}],
			"_metadata":{"apiPlan":"Free Tier","apiRequestsRemaining":900,"apiDailyRequestsRemaining":90}
		}`))
	}))
	defer server.Close()

	client := &justTCGClient{
		apiKey:        "test-key",
		baseURL:       server.URL,
		httpClient:    server.Client(),
		delay:         minimumRequestDelay,
		historyWindow: "30d",
	}
	response, err := client.batch(context.Background(), []batchLookup{{
		CardID: "card-uuid",
	}})
	if err != nil {
		t.Fatalf("batch returned error: %v", err)
	}
	if len(response.Data) != 1 || response.Data[0].UUID != "card-uuid" {
		t.Fatalf("response = %#v", response)
	}
	if response.Metadata.APIRequestsRemaining != 900 {
		t.Fatalf("monthly remaining = %d, want 900", response.Metadata.APIRequestsRemaining)
	}
	if got := len(response.Data[0].Variants[0].PriceHistory); got != 1 {
		t.Fatalf("history points = %d, want 1", got)
	}
}

func TestClientBatchPreservesProviderQuotaDetailWithoutRetry(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests++
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusTooManyRequests)
		_, _ = writer.Write([]byte(`{"error":"Total request limit exceeded"}`))
	}))
	defer server.Close()

	client := &justTCGClient{
		apiKey:        "test-key",
		baseURL:       server.URL,
		httpClient:    server.Client(),
		delay:         minimumRequestDelay,
		historyWindow: "30d",
	}
	_, err := client.batch(context.Background(), []batchLookup{{CardID: "card-uuid"}})
	var quotaError *providerRateLimitError
	if !errors.As(err, &quotaError) {
		t.Fatalf("batch error = %v, want providerRateLimitError", err)
	}
	if quotaError.detail != "Total request limit exceeded" {
		t.Fatalf("quota detail = %q", quotaError.detail)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
}

func TestQuotaReserveReached(t *testing.T) {
	tests := []struct {
		name     string
		metadata usageMetadata
		want     bool
	}{
		{
			name: "room remains",
			metadata: usageMetadata{
				APIPlan:                   "Free Tier",
				APIRequestsRemaining:      500,
				APIDailyRequestsRemaining: 50,
			},
			want: false,
		},
		{
			name: "daily reserve",
			metadata: usageMetadata{
				APIPlan:                   "Free Tier",
				APIRequestsRemaining:      500,
				APIDailyRequestsRemaining: 5,
			},
			want: true,
		},
		{
			name: "monthly reserve",
			metadata: usageMetadata{
				APIPlan:                   "Free Tier",
				APIRequestsRemaining:      100,
				APIDailyRequestsRemaining: 50,
			},
			want: true,
		},
		{name: "metadata absent", metadata: usageMetadata{}, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := quotaReserveReached(test.metadata, 5, 100); got != test.want {
				t.Fatalf("quotaReserveReached() = %t, want %t", got, test.want)
			}
		})
	}
}

func TestClientWaitHonorsCanceledContext(t *testing.T) {
	client := &justTCGClient{delay: time.Hour, lastRequest: time.Now()}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := client.wait(ctx); err == nil {
		t.Fatal("wait returned nil for canceled context")
	}
}

func TestSelectDailyBudgetProtectsHistoricalBootstrap(t *testing.T) {
	tests := []struct {
		name       string
		setCount   int
		wantBudget int
		wantPhase  string
	}{
		{name: "bootstrap", setCount: 9, wantBudget: 0, wantPhase: "historical-bootstrap"},
		{name: "complete", setCount: 38, wantBudget: 28, wantPhase: "steady-state"},
		{name: "expanded", setCount: 40, wantBudget: 28, wantPhase: "steady-state"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			budget, phase := selectDailyBudget(test.setCount, 38, 0, 28)
			if budget != test.wantBudget || phase != test.wantPhase {
				t.Fatalf("selectDailyBudget() = (%d, %q), want (%d, %q)",
					budget, phase, test.wantBudget, test.wantPhase)
			}
		})
	}
}

func TestEstimatedRotationDays(t *testing.T) {
	tests := []struct {
		name          string
		targets       int
		requestBudget int
		want          int
	}{
		{name: "empty catalog", targets: 0, requestBudget: 20, want: 0},
		{name: "invalid budget", targets: 808, requestBudget: 0, want: 0},
		{name: "bootstrap catalog", targets: 808, requestBudget: 20, want: 3},
		{name: "full legacy catalog", targets: 3697, requestBudget: 28, want: 7},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := estimatedRotationDays(test.targets, test.requestBudget); got != test.want {
				t.Fatalf("estimatedRotationDays() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestObservationsForVariantPreservesHistoryAndCurrentPrice(t *testing.T) {
	historicalPrice := 10.0
	currentPrice := 12.0
	variant := providerVariant{
		ID:    "variant-id",
		Price: &currentPrice,
		PriceHistory: []providerPricePoint{
			{Price: &historicalPrice, Timestamp: 1780272000},
			{Price: &historicalPrice, Timestamp: 0},
		},
	}

	observations, historicalCount, err := observationsForVariant(
		"stored-variant",
		variant,
		time.Date(2026, 6, 2, 12, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("observationsForVariant() error = %v", err)
	}
	if historicalCount != 1 {
		t.Fatalf("historicalCount = %d, want 1", historicalCount)
	}
	if len(observations) != 2 {
		t.Fatalf("observations = %d, want 2", len(observations))
	}
	current := observations["stored-variant\x002026-06-02"]
	if current.Price != currentPrice {
		t.Fatalf("current observation price = %.2f, want %.2f", current.Price, currentPrice)
	}
}

func TestObservationsForVariantRejectsNegativeHistory(t *testing.T) {
	price := -1.0
	_, _, err := observationsForVariant("stored-variant", providerVariant{
		ID: "variant-id",
		PriceHistory: []providerPricePoint{
			{Price: &price, Timestamp: 1780272000},
		},
	}, time.Date(2026, 6, 2, 12, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("observationsForVariant() returned nil error for negative history")
	}
}
