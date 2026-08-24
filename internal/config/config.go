package config

import (
	"fmt"
	"os"
	"strings"
)

const (
	defaultHTTPAddr     = "127.0.0.1:4000"
	defaultDatabaseURL  = "postgres://binder_ledger_dev:binder_ledger_dev@127.0.0.1:5433/binder_ledger_dev?sslmode=disable"
	defaultOrigins      = "http://localhost:8081,http://127.0.0.1:8081"
	defaultCardImageDir = "data/card-images"
)

type Config struct {
	HTTPAddr           string
	DatabaseURL        string
	CORSAllowedOrigins []string
	CardImageDir       string
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:           valueOrDefault("HTTP_ADDR", defaultHTTPAddr),
		DatabaseURL:        valueOrDefault("DATABASE_URL", defaultDatabaseURL),
		CORSAllowedOrigins: splitCSV(valueOrDefault("CORS_ALLOWED_ORIGINS", defaultOrigins)),
		CardImageDir:       valueOrDefault("CARD_IMAGE_DIR", defaultCardImageDir),
	}

	if cfg.HTTPAddr == "" {
		return Config{}, fmt.Errorf("HTTP_ADDR must not be empty")
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL must not be empty")
	}
	if cfg.CardImageDir == "" {
		return Config{}, fmt.Errorf("CARD_IMAGE_DIR must not be empty")
	}

	return cfg, nil
}

func valueOrDefault(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(value)
	}
	return fallback
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
