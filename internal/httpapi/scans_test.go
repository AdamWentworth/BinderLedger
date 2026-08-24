package httpapi

import "testing"

func TestValidScanPlatform(t *testing.T) {
	for _, value := range []string{"android", "ios", "web", "unknown"} {
		if !validScanPlatform(value) {
			t.Fatalf("platform %q should be valid", value)
		}
	}
	if validScanPlatform("desktop") {
		t.Fatal("unsupported platform should be invalid")
	}
}

func TestValidScanID(t *testing.T) {
	if !validScanID("34a0d2ac-b96a-41e0-a6b8-b3e57e412990") {
		t.Fatal("UUID should be valid")
	}
	for _, value := range []string{
		"",
		"34A0D2AC-B96A-41E0-A6B8-B3E57E412990",
		"../../34a0d2ac-b96a-41e0-a6b8-b3e57e412990",
		"34a0d2ac-b96a-41e0-a6b8-b3e57e41299z",
	} {
		if validScanID(value) {
			t.Fatalf("scan id %q should be invalid", value)
		}
	}
}
