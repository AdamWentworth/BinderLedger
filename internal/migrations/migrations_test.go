package migrations

import (
	"io/fs"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var migrationNamePattern = regexp.MustCompile(`^(\d{5})_[a-z0-9_]+\.sql$`)

func TestMigrationFilesAreContiguousAndReversible(t *testing.T) {
	entries, err := fs.ReadDir(Files, ".")
	if err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	}

	migrationCount := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		migrationCount++
		matches := migrationNamePattern.FindStringSubmatch(entry.Name())
		if matches == nil {
			t.Errorf("migration %q does not match NNNNN_description.sql", entry.Name())
			continue
		}

		number, err := strconv.Atoi(matches[1])
		if err != nil {
			t.Errorf("migration %q has invalid sequence: %v", entry.Name(), err)
			continue
		}
		if number != migrationCount {
			t.Errorf("migration %q has sequence %d, want %d", entry.Name(), number, migrationCount)
		}

		contents, err := Files.ReadFile(entry.Name())
		if err != nil {
			t.Errorf("ReadFile(%q) error = %v", entry.Name(), err)
			continue
		}
		sql := string(contents)
		for _, marker := range []string{"-- +goose Up", "-- +goose Down"} {
			if !strings.Contains(sql, marker) {
				t.Errorf("migration %q is missing %s", entry.Name(), marker)
			}
		}
	}

	if migrationCount == 0 {
		t.Fatal("embedded migration set is empty")
	}
	t.Logf("validated %d migrations", migrationCount)
}
