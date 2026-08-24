package config

import (
	"reflect"
	"testing"
)

func TestLoad(t *testing.T) {
	t.Setenv("HTTP_ADDR", " 127.0.0.1:4100 ")
	t.Setenv("DATABASE_URL", defaultDatabaseURL)
	t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:8081, http://127.0.0.1:8081")
	t.Setenv("CARD_IMAGE_DIR", "/tmp/binderledger-card-images")

	got, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if got.HTTPAddr != "127.0.0.1:4100" {
		t.Fatalf("HTTPAddr = %q", got.HTTPAddr)
	}
	wantOrigins := []string{"http://localhost:8081", "http://127.0.0.1:8081"}
	if !reflect.DeepEqual(got.CORSAllowedOrigins, wantOrigins) {
		t.Fatalf("CORSAllowedOrigins = %#v, want %#v", got.CORSAllowedOrigins, wantOrigins)
	}
	if got.CardImageDir != "/tmp/binderledger-card-images" {
		t.Fatalf("CardImageDir = %q", got.CardImageDir)
	}
}

func TestLoadRejectsEmptyDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", " ")
	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want an error")
	}
}
