package providerquota

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestQuotaCycleUsesBillingDay(t *testing.T) {
	start, end := QuotaCycle(time.Date(2026, 9, 22, 23, 59, 0, 0, time.UTC), 23)
	if got, want := start.Format(time.RFC3339), "2026-08-23T00:00:00Z"; got != want {
		t.Fatalf("cycle start = %s, want %s", got, want)
	}
	if got, want := end.Format(time.RFC3339), "2026-09-23T00:00:00Z"; got != want {
		t.Fatalf("cycle end = %s, want %s", got, want)
	}
}

func TestLedgerPersistsAttemptsAndReservesCapacity(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	config := Config{
		Filename:        filepath.Join(t.TempDir(), "quota.json"),
		Provider:        "JustTCG",
		MonthlyLimit:    3,
		MonthlyReserve:  1,
		MonthlyResetDay: 23,
		Now:             func() time.Time { return now },
	}
	first, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := first.ReserveRequest(); err != nil {
		t.Fatal(err)
	}
	restarted, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.ReserveRequest(); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.ReserveRequest(); !errors.Is(err, ErrExhausted) {
		t.Fatalf("third request error = %v, want ErrExhausted", err)
	}
}

func TestLedgerHonorsConfiguredBlock(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	blockedUntil := time.Date(2026, 9, 23, 7, 0, 0, 0, time.UTC)
	ledger, err := New(Config{
		Filename:        filepath.Join(t.TempDir(), "quota.json"),
		Provider:        "JustTCG",
		MonthlyLimit:    1000,
		MonthlyReserve:  25,
		MonthlyResetDay: 23,
		BlockedUntil:    &blockedUntil,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ledger.ReserveRequest(); !errors.Is(err, ErrBlocked) {
		t.Fatalf("reserve error = %v, want ErrBlocked", err)
	}
}

func TestProviderTotalLimitBlocksThroughCycleEnd(t *testing.T) {
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	ledger, err := New(Config{
		Filename:        filepath.Join(t.TempDir(), "quota.json"),
		Provider:        "JustTCG",
		MonthlyLimit:    1000,
		MonthlyReserve:  25,
		MonthlyResetDay: 23,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	status, err := ledger.BlockFromProviderResponse("Total request limit exceeded", 0)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := status.BlockedUntil.Format(time.RFC3339), "2026-09-23T00:00:00Z"; got != want {
		t.Fatalf("blocked until = %s, want %s", got, want)
	}
}
