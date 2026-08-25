package main

import (
	"context"
	"encoding/json"
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
	for _, lookup := range lookups {
		if lookup.IncludePriceHistory != "false" {
			t.Fatalf("history setting = %q, want false", lookup.IncludePriceHistory)
		}
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
		var body []map[string]string
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if len(body) != 1 || body[0]["cardId"] != "card-uuid" {
			t.Fatalf("request body = %#v", body)
		}
		if body[0]["include_price_history"] != "false" {
			t.Fatalf("include_price_history = %q, want false", body[0]["include_price_history"])
		}

		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{
			"data":[{"id":"card-slug","uuid":"card-uuid","tcgplayerId":"42","variants":[]}],
			"_metadata":{"apiPlan":"Free Tier","apiRequestsRemaining":900,"apiDailyRequestsRemaining":90}
		}`))
	}))
	defer server.Close()

	client := &justTCGClient{
		apiKey:     "test-key",
		baseURL:    server.URL,
		httpClient: server.Client(),
		delay:      minimumRequestDelay,
	}
	response, err := client.batch(context.Background(), []batchLookup{{
		CardID:              "card-uuid",
		IncludePriceHistory: "false",
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
		{name: "bootstrap", setCount: 9, wantBudget: 20, wantPhase: "historical-bootstrap"},
		{name: "complete", setCount: 38, wantBudget: 28, wantPhase: "steady-state"},
		{name: "expanded", setCount: 40, wantBudget: 28, wantPhase: "steady-state"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			budget, phase := selectDailyBudget(test.setCount, 38, 20, 28)
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
