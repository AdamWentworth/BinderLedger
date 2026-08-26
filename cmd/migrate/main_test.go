package main

import "testing"

func TestMigrationDirection(t *testing.T) {
	tests := []struct {
		name      string
		arguments []string
		want      string
		wantError bool
	}{
		{name: "defaults to up", want: "up"},
		{name: "explicit up", arguments: []string{"-direction=up"}, want: "up"},
		{name: "explicit down", arguments: []string{"-direction=down"}, want: "down"},
		{name: "unknown direction", arguments: []string{"-direction=sideways"}, wantError: true},
		{name: "positional argument", arguments: []string{"down"}, wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := migrationDirection(test.arguments)
			if test.wantError {
				if err == nil {
					t.Fatalf("migrationDirection(%v) unexpectedly succeeded", test.arguments)
				}
				return
			}
			if err != nil {
				t.Fatalf("migrationDirection(%v) error = %v", test.arguments, err)
			}
			if got != test.want {
				t.Fatalf("migrationDirection(%v) = %q, want %q", test.arguments, got, test.want)
			}
		})
	}
}
