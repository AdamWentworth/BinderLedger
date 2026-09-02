package providerquota

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const stateVersion = 1

var (
	ErrBlocked   = errors.New("provider requests are temporarily blocked")
	ErrExhausted = errors.New("provider request budget is exhausted")
)

type Config struct {
	Filename        string
	Provider        string
	MonthlyLimit    int
	MonthlyReserve  int
	MonthlyResetDay int
	BlockedUntil    *time.Time
	Now             func() time.Time
}

type Status struct {
	CycleStart        time.Time
	CycleEnd          time.Time
	RequestAttempts   int
	RequestLimit      int
	RequestReserve    int
	RequestsRemaining int
	Blocked           bool
	BlockedUntil      *time.Time
	BlockReason       string
}

type state struct {
	Version         int    `json:"version"`
	Provider        string `json:"provider"`
	CycleStart      string `json:"cycleStart"`
	CycleEnd        string `json:"cycleEnd"`
	RequestAttempts int    `json:"requestAttempts"`
	BlockedUntil    string `json:"blockedUntil,omitempty"`
	BlockReason     string `json:"blockReason,omitempty"`
	UpdatedAt       string `json:"updatedAt"`
}

type Ledger struct {
	config Config
	mu     sync.Mutex
}

func New(config Config) (*Ledger, error) {
	if strings.TrimSpace(config.Filename) == "" {
		return nil, errors.New("quota ledger filename must be set")
	}
	if strings.TrimSpace(config.Provider) == "" {
		return nil, errors.New("quota ledger provider must be set")
	}
	if config.MonthlyLimit <= 0 {
		return nil, errors.New("monthly request limit must be positive")
	}
	if config.MonthlyReserve < 0 || config.MonthlyReserve >= config.MonthlyLimit {
		return nil, errors.New("monthly request reserve must be nonnegative and lower than the limit")
	}
	if config.MonthlyResetDay < 1 || config.MonthlyResetDay > 28 {
		return nil, errors.New("monthly reset day must be between 1 and 28")
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	return &Ledger{config: config}, nil
}

func (ledger *Ledger) Status() (Status, error) {
	ledger.mu.Lock()
	defer ledger.mu.Unlock()
	now := ledger.config.Now().UTC()
	current, err := ledger.load(now)
	if err != nil {
		return Status{}, err
	}
	return ledger.status(current, now)
}

func (ledger *Ledger) ReserveRequest() (Status, error) {
	ledger.mu.Lock()
	defer ledger.mu.Unlock()
	now := ledger.config.Now().UTC()
	current, err := ledger.load(now)
	if err != nil {
		return Status{}, err
	}
	status, err := ledger.status(current, now)
	if err != nil {
		return Status{}, err
	}
	if status.Blocked {
		return status, fmt.Errorf("%w until %s: %s", ErrBlocked, status.BlockedUntil.Format(time.RFC3339), status.BlockReason)
	}
	if status.RequestsRemaining <= 0 {
		return status, fmt.Errorf("%w until %s", ErrExhausted, status.CycleEnd.Format(time.RFC3339))
	}
	current.RequestAttempts++
	current.UpdatedAt = now.Format(time.RFC3339Nano)
	if err := ledger.write(current); err != nil {
		return Status{}, err
	}
	return ledger.status(current, now)
}

func (ledger *Ledger) ReconcileProviderUsage(requestsUsed int) (Status, error) {
	ledger.mu.Lock()
	defer ledger.mu.Unlock()
	now := ledger.config.Now().UTC()
	current, err := ledger.load(now)
	if err != nil {
		return Status{}, err
	}
	if requestsUsed > current.RequestAttempts {
		current.RequestAttempts = requestsUsed
		current.UpdatedAt = now.Format(time.RFC3339Nano)
		if err := ledger.write(current); err != nil {
			return Status{}, err
		}
	}
	return ledger.status(current, now)
}

func (ledger *Ledger) BlockFromProviderResponse(detail string, retryAfter time.Duration) (Status, error) {
	ledger.mu.Lock()
	defer ledger.mu.Unlock()
	now := ledger.config.Now().UTC()
	current, err := ledger.load(now)
	if err != nil {
		return Status{}, err
	}
	_, cycleEnd := quotaCycle(now, ledger.config.MonthlyResetDay)
	normalized := strings.TrimSpace(detail)
	if normalized == "" {
		normalized = "provider rate limit"
	}
	var blockedUntil time.Time
	switch lower := strings.ToLower(normalized); {
	case strings.Contains(lower, "total"), strings.Contains(lower, "monthly"):
		blockedUntil = cycleEnd
	case strings.Contains(lower, "daily"):
		blockedUntil = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	default:
		if retryAfter <= 0 {
			retryAfter = 15 * time.Minute
		}
		blockedUntil = now.Add(retryAfter)
	}
	if existing, parseErr := parseOptionalTime(current.BlockedUntil); parseErr != nil {
		return Status{}, parseErr
	} else if existing != nil && existing.After(blockedUntil) {
		blockedUntil = *existing
	}
	current.BlockedUntil = blockedUntil.Format(time.RFC3339Nano)
	current.BlockReason = normalized
	current.UpdatedAt = now.Format(time.RFC3339Nano)
	if err := ledger.write(current); err != nil {
		return Status{}, err
	}
	return ledger.status(current, now)
}

func (ledger *Ledger) status(current state, now time.Time) (Status, error) {
	cycleStart, err := time.Parse(time.RFC3339Nano, current.CycleStart)
	if err != nil {
		return Status{}, fmt.Errorf("parse quota cycle start: %w", err)
	}
	cycleEnd, err := time.Parse(time.RFC3339Nano, current.CycleEnd)
	if err != nil {
		return Status{}, fmt.Errorf("parse quota cycle end: %w", err)
	}
	persistedBlock, err := parseOptionalTime(current.BlockedUntil)
	if err != nil {
		return Status{}, err
	}
	blockedUntil := laterTime(persistedBlock, ledger.config.BlockedUntil)
	blocked := blockedUntil != nil && blockedUntil.After(now)
	blockReason := ""
	if blocked {
		if ledger.config.BlockedUntil != nil && (persistedBlock == nil || !persistedBlock.After(*ledger.config.BlockedUntil)) {
			blockReason = "operator-configured quota pause"
		} else {
			blockReason = current.BlockReason
			if blockReason == "" {
				blockReason = "provider quota pause"
			}
		}
	}
	remaining := ledger.config.MonthlyLimit - ledger.config.MonthlyReserve - current.RequestAttempts
	if remaining < 0 {
		remaining = 0
	}
	return Status{
		CycleStart:        cycleStart,
		CycleEnd:          cycleEnd,
		RequestAttempts:   current.RequestAttempts,
		RequestLimit:      ledger.config.MonthlyLimit,
		RequestReserve:    ledger.config.MonthlyReserve,
		RequestsRemaining: remaining,
		Blocked:           blocked,
		BlockedUntil:      blockedUntil,
		BlockReason:       blockReason,
	}, nil
}

func (ledger *Ledger) load(now time.Time) (state, error) {
	cycleStart, cycleEnd := quotaCycle(now, ledger.config.MonthlyResetDay)
	contents, err := os.ReadFile(ledger.config.Filename)
	if errors.Is(err, os.ErrNotExist) {
		return ledger.newState(cycleStart, cycleEnd, now)
	}
	if err != nil {
		return state{}, fmt.Errorf("read quota ledger: %w", err)
	}
	var current state
	if err := json.Unmarshal(contents, &current); err != nil {
		return state{}, fmt.Errorf("decode quota ledger: %w", err)
	}
	if current.Version != stateVersion || current.Provider != ledger.config.Provider || current.RequestAttempts < 0 {
		return state{}, errors.New("quota ledger contains incompatible or invalid state")
	}
	if current.CycleStart != cycleStart.Format(time.RFC3339Nano) {
		return ledger.newState(cycleStart, cycleEnd, now)
	}
	return current, nil
}

func (ledger *Ledger) newState(cycleStart, cycleEnd, now time.Time) (state, error) {
	current := state{
		Version:         stateVersion,
		Provider:        ledger.config.Provider,
		CycleStart:      cycleStart.Format(time.RFC3339Nano),
		CycleEnd:        cycleEnd.Format(time.RFC3339Nano),
		RequestAttempts: 0,
		UpdatedAt:       now.Format(time.RFC3339Nano),
	}
	if err := ledger.write(current); err != nil {
		return state{}, err
	}
	return current, nil
}

func (ledger *Ledger) write(current state) error {
	if err := os.MkdirAll(filepath.Dir(ledger.config.Filename), 0o750); err != nil {
		return fmt.Errorf("create quota ledger directory: %w", err)
	}
	contents, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return fmt.Errorf("encode quota ledger: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(ledger.config.Filename), ".justtcg-quota-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary quota ledger: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o640); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("set quota ledger permissions: %w", err)
	}
	if _, err := temporary.Write(append(contents, '\n')); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write quota ledger: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close quota ledger: %w", err)
	}
	if err := os.Rename(temporaryName, ledger.config.Filename); err != nil {
		return fmt.Errorf("replace quota ledger: %w", err)
	}
	return nil
}

func quotaCycle(now time.Time, resetDay int) (time.Time, time.Time) {
	now = now.UTC()
	startYear, startMonth := now.Year(), now.Month()
	if now.Day() < resetDay {
		startMonth--
		if startMonth < time.January {
			startMonth = time.December
			startYear--
		}
	}
	start := time.Date(startYear, startMonth, resetDay, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	return start, end
}

func parseOptionalTime(value string) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return nil, fmt.Errorf("parse quota blocked-until timestamp: %w", err)
	}
	return &parsed, nil
}

func laterTime(first, second *time.Time) *time.Time {
	if first == nil {
		return second
	}
	if second == nil || first.After(*second) {
		return first
	}
	return second
}

func QuotaCycle(now time.Time, resetDay int) (time.Time, time.Time) {
	return quotaCycle(now, resetDay)
}
