package main

import "testing"

func TestNumberSort(t *testing.T) {
	tests := map[string]*int{
		"004/102": intPointer(4),
		"11/64":   intPointer(11),
		"":        nil,
		"SWSH001": nil,
	}

	for input, want := range tests {
		got := numberSort(input)
		if got == nil && want == nil {
			continue
		}
		if got == nil || want == nil || *got != *want {
			t.Errorf("numberSort(%q) = %v, want %v", input, got, want)
		}
	}
}

func intPointer(value int) *int {
	return &value
}
