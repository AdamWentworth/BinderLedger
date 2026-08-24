package watchlist

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/AdamWentworth/BinderLedger/internal/catalog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db      *pgxpool.Pool
	catalog *catalog.Repository
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db, catalog: catalog.NewRepository(db)}
}

func (repository *Repository) Memberships(
	ctx context.Context,
	watchlistID string,
) (Memberships, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return Memberships{}, err
	} else if !ok {
		return Memberships{}, ErrWatchlistNotFound
	}

	memberships := Memberships{
		ID:    watchlistID,
		Cards: make([]CardMembership, 0),
		Sets:  make([]SetMembership, 0),
	}
	cardRows, err := repository.db.Query(ctx, `
		SELECT id, card_id, edition, finish, language
		FROM watchlist_card_items
		WHERE watchlist_id = $1
		ORDER BY added_at DESC, id DESC
	`, watchlistID)
	if err != nil {
		return Memberships{}, fmt.Errorf("query watched card memberships: %w", err)
	}
	defer cardRows.Close()
	for cardRows.Next() {
		var membership CardMembership
		if err := cardRows.Scan(
			&membership.ItemID,
			&membership.CardID,
			&membership.Edition,
			&membership.Finish,
			&membership.Language,
		); err != nil {
			return Memberships{}, fmt.Errorf("scan watched card membership: %w", err)
		}
		memberships.Cards = append(memberships.Cards, membership)
	}
	if err := cardRows.Err(); err != nil {
		return Memberships{}, fmt.Errorf("read watched card memberships: %w", err)
	}
	cardRows.Close()

	setRows, err := repository.db.Query(ctx, `
		SELECT id, set_id, edition
		FROM watchlist_set_items
		WHERE watchlist_id = $1
		ORDER BY added_at DESC, id DESC
	`, watchlistID)
	if err != nil {
		return Memberships{}, fmt.Errorf("query watched set memberships: %w", err)
	}
	defer setRows.Close()
	for setRows.Next() {
		var membership SetMembership
		if err := setRows.Scan(
			&membership.ItemID,
			&membership.SetID,
			&membership.Edition,
		); err != nil {
			return Memberships{}, fmt.Errorf("scan watched set membership: %w", err)
		}
		memberships.Sets = append(memberships.Sets, membership)
	}
	if err := setRows.Err(); err != nil {
		return Memberships{}, fmt.Errorf("read watched set memberships: %w", err)
	}
	return memberships, nil
}

func (repository *Repository) Overview(ctx context.Context, filter Filter) (Overview, error) {
	filter.WatchlistID = strings.TrimSpace(filter.WatchlistID)
	var overview Overview
	if err := repository.db.QueryRow(ctx, `
		SELECT id, name
		FROM watchlists
		WHERE id = $1
	`, filter.WatchlistID).Scan(&overview.ID, &overview.Name); errors.Is(err, pgx.ErrNoRows) {
		return Overview{}, ErrWatchlistNotFound
	} else if err != nil {
		return Overview{}, fmt.Errorf("query watchlist: %w", err)
	}

	overview.Period = filter.Period.Key
	overview.Condition = filter.Condition
	overview.Cards = make([]Card, 0)
	overview.Sets = make([]Set, 0)

	cards, err := repository.cards(ctx, filter)
	if err != nil {
		return Overview{}, err
	}
	overview.Cards = cards

	sets, err := repository.sets(ctx, filter)
	if err != nil {
		return Overview{}, err
	}
	overview.Sets = sets
	overview.Summary = summarize(cards, sets)
	return overview, nil
}
