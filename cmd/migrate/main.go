package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/AdamWentworth/BinderLedger/internal/config"
	"github.com/AdamWentworth/BinderLedger/internal/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	direction, err := migrationDirection(arguments)
	if err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrations.Files)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set migration dialect: %w", err)
	}
	switch direction {
	case "up":
		if err := goose.UpContext(context.Background(), db, "."); err != nil {
			return fmt.Errorf("run migrations: %w", err)
		}
	case "down":
		if err := goose.DownContext(context.Background(), db, "."); err != nil {
			return fmt.Errorf("roll back latest migration: %w", err)
		}
	}
	return nil
}

func migrationDirection(arguments []string) (string, error) {
	flags := flag.NewFlagSet("binderledger-migrate", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	direction := flags.String("direction", "up", "migration direction: up or down")
	if err := flags.Parse(arguments); err != nil {
		return "", fmt.Errorf("parse migration arguments: %w", err)
	}
	if flags.NArg() != 0 {
		return "", fmt.Errorf("unexpected migration arguments: %v", flags.Args())
	}
	if *direction != "up" && *direction != "down" {
		return "", fmt.Errorf("unsupported migration direction %q", *direction)
	}
	return *direction, nil
}
