package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type manualSnapshot struct {
	ObservedOn string              `json:"observedOn"`
	SourceURL  string              `json:"sourceUrl"`
	Values     map[string]*float64 `json:"values"`
}

type referenceTarget struct {
	ID        string
	Label     string
	Currency  string
	CheckedOn time.Time
}

type snapshotValue struct {
	Reference referenceTarget
	Amount    *string
}

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("record-valuation-snapshot", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	inputPath := flags.String("input", "", "path to a manually reviewed snapshot JSON file")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*inputPath) == "" {
		return errors.New("-input is required")
	}

	snapshot, err := readSnapshot(*inputPath)
	if err != nil {
		return err
	}
	appConfig, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.Open(ctx, appConfig.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	references, err := findReferences(ctx, db, snapshot.SourceURL)
	if err != nil {
		return err
	}
	values, observedOn, err := validateSnapshot(snapshot, references, time.Now())
	if err != nil {
		return err
	}
	inserted, err := recordSnapshot(ctx, db, observedOn, values)
	if err != nil {
		return err
	}

	fmt.Printf(
		"confirmed %d valuation values (%d new observations) for %s on %s\n",
		len(values),
		inserted,
		snapshot.SourceURL,
		observedOn.Format(time.DateOnly),
	)
	return nil
}

func readSnapshot(path string) (manualSnapshot, error) {
	file, err := os.Open(path)
	if err != nil {
		return manualSnapshot{}, fmt.Errorf("open snapshot: %w", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(io.LimitReader(file, 1<<20))
	decoder.DisallowUnknownFields()
	var snapshot manualSnapshot
	if err := decoder.Decode(&snapshot); err != nil {
		return manualSnapshot{}, fmt.Errorf("decode snapshot: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return manualSnapshot{}, errors.New("decode snapshot: multiple JSON values are not allowed")
		}
		return manualSnapshot{}, fmt.Errorf("decode snapshot trailer: %w", err)
	}
	return snapshot, nil
}

func findReferences(
	ctx context.Context,
	db *pgxpool.Pool,
	sourceURL string,
) ([]referenceTarget, error) {
	rows, err := db.Query(ctx, `
		SELECT id, label, currency, checked_on
		FROM catalog_valuation_references
		WHERE source_name = 'PriceCharting'
		  AND source_url = $1
		ORDER BY sort_order, label
	`, strings.TrimSpace(sourceURL))
	if err != nil {
		return nil, fmt.Errorf("query valuation references: %w", err)
	}
	defer rows.Close()

	references := make([]referenceTarget, 0, 12)
	for rows.Next() {
		var reference referenceTarget
		if err := rows.Scan(
			&reference.ID,
			&reference.Label,
			&reference.Currency,
			&reference.CheckedOn,
		); err != nil {
			return nil, fmt.Errorf("scan valuation reference: %w", err)
		}
		references = append(references, reference)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read valuation references: %w", err)
	}
	if len(references) == 0 {
		return nil, fmt.Errorf("no PriceCharting references match source URL %q", sourceURL)
	}
	return references, nil
}

func validateSnapshot(
	snapshot manualSnapshot,
	references []referenceTarget,
	today time.Time,
) ([]snapshotValue, time.Time, error) {
	observedOn, err := time.Parse(time.DateOnly, strings.TrimSpace(snapshot.ObservedOn))
	if err != nil {
		return nil, time.Time{}, errors.New("observedOn must use YYYY-MM-DD")
	}
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	if observedOn.After(today) {
		return nil, time.Time{}, errors.New("observedOn cannot be in the future")
	}
	if strings.TrimSpace(snapshot.SourceURL) == "" {
		return nil, time.Time{}, errors.New("sourceUrl is required")
	}

	expected := make(map[string]referenceTarget, len(references))
	for _, reference := range references {
		if _, duplicate := expected[reference.Label]; duplicate {
			return nil, time.Time{}, fmt.Errorf("duplicate stored reference label %q", reference.Label)
		}
		if !reference.CheckedOn.IsZero() && observedOn.Before(reference.CheckedOn) {
			return nil, time.Time{}, fmt.Errorf(
				"observedOn predates the current %s reference check on %s",
				reference.Label,
				reference.CheckedOn.Format(time.DateOnly),
			)
		}
		expected[reference.Label] = reference
	}

	missing := make([]string, 0)
	for label := range expected {
		if _, ok := snapshot.Values[label]; !ok {
			missing = append(missing, label)
		}
	}
	extra := make([]string, 0)
	for label := range snapshot.Values {
		if _, ok := expected[label]; !ok {
			extra = append(extra, label)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 || len(extra) > 0 {
		return nil, time.Time{}, fmt.Errorf(
			"snapshot labels do not match stored references (missing: %s; extra: %s)",
			strings.Join(missing, ", "),
			strings.Join(extra, ", "),
		)
	}

	values := make([]snapshotValue, 0, len(references))
	for _, reference := range references {
		amount := snapshot.Values[reference.Label]
		if amount == nil {
			values = append(values, snapshotValue{Reference: reference})
			continue
		}
		if math.IsNaN(*amount) || math.IsInf(*amount, 0) || *amount < 0 {
			return nil, time.Time{}, fmt.Errorf("%s must be a non-negative number", reference.Label)
		}
		rounded := math.Round(*amount*100) / 100
		if math.Abs(*amount-rounded) > 0.0000001 {
			return nil, time.Time{}, fmt.Errorf("%s must have at most two decimal places", reference.Label)
		}
		if rounded > 9999999999.99 {
			return nil, time.Time{}, fmt.Errorf("%s exceeds the supported price range", reference.Label)
		}
		normalized := fmt.Sprintf("%.2f", rounded)
		values = append(values, snapshotValue{
			Reference: reference,
			Amount:    &normalized,
		})
	}
	return values, observedOn, nil
}

func recordSnapshot(
	ctx context.Context,
	db *pgxpool.Pool,
	observedOn time.Time,
	values []snapshotValue,
) (int, error) {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return 0, fmt.Errorf("begin snapshot transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	inserted := 0
	for _, value := range values {
		var existing string
		err := tx.QueryRow(ctx, `
			SELECT coalesce(amount::text, '')
			FROM catalog_valuation_observations
			WHERE valuation_reference_id = $1
			  AND observed_on = $2
		`, value.Reference.ID, observedOn).Scan(&existing)
		switch {
		case err == nil && existing != optionalAmount(value.Amount):
			return 0, fmt.Errorf(
				"%s already has a different observation on %s",
				value.Reference.Label,
				observedOn.Format(time.DateOnly),
			)
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			return 0, fmt.Errorf("check existing %s observation: %w", value.Reference.Label, err)
		case errors.Is(err, pgx.ErrNoRows):
			if _, err := tx.Exec(ctx, `
				INSERT INTO catalog_valuation_observations (
					valuation_reference_id,
					observed_on,
					amount,
					currency,
					collection_method
				)
				VALUES ($1, $2, $3, $4, 'manual')
			`, value.Reference.ID, observedOn, amountArgument(value.Amount), value.Reference.Currency); err != nil {
				return 0, fmt.Errorf("insert %s observation: %w", value.Reference.Label, err)
			}
			inserted++
		}

		if _, err := tx.Exec(ctx, `
			UPDATE catalog_valuation_references
			SET amount = $2, checked_on = $3
			WHERE id = $1
		`, value.Reference.ID, amountArgument(value.Amount), observedOn); err != nil {
			return 0, fmt.Errorf("update %s reference: %w", value.Reference.Label, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit snapshot transaction: %w", err)
	}
	return inserted, nil
}

func optionalAmount(amount *string) string {
	if amount == nil {
		return ""
	}
	return *amount
}

func amountArgument(amount *string) any {
	if amount == nil {
		return nil
	}
	return *amount
}
