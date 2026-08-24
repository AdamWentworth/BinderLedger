package watchlist

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (repository *Repository) AddCard(
	ctx context.Context,
	watchlistID string,
	target CardTarget,
) (CardMembership, bool, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return CardMembership{}, false, err
	} else if !ok {
		return CardMembership{}, false, ErrWatchlistNotFound
	}

	var membership CardMembership
	err := repository.db.QueryRow(ctx, `
		INSERT INTO watchlist_card_items (watchlist_id, card_id, edition, finish, language)
		SELECT $1, $2, $3, $4, $5
		WHERE EXISTS (
			SELECT 1
			FROM catalog_price_quality quality
			WHERE quality.card_id = $2
			  AND quality.edition = $3
			  AND quality.finish = $4
			  AND quality.language = $5
		)
		ON CONFLICT (watchlist_id, card_id, edition, finish, language) DO NOTHING
		RETURNING id, card_id, edition, finish, language
	`, watchlistID, target.CardID, target.Edition, target.Finish, target.Language).Scan(
		&membership.ItemID,
		&membership.CardID,
		&membership.Edition,
		&membership.Finish,
		&membership.Language,
	)
	if err == nil {
		return membership, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return CardMembership{}, false, fmt.Errorf("add watched card: %w", err)
	}

	err = repository.db.QueryRow(ctx, `
		SELECT id, card_id, edition, finish, language
		FROM watchlist_card_items
		WHERE watchlist_id = $1
		  AND card_id = $2
		  AND edition = $3
		  AND finish = $4
		  AND language = $5
	`, watchlistID, target.CardID, target.Edition, target.Finish, target.Language).Scan(
		&membership.ItemID,
		&membership.CardID,
		&membership.Edition,
		&membership.Finish,
		&membership.Language,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return CardMembership{}, false, ErrCardPrintingMissing
	}
	if err != nil {
		return CardMembership{}, false, fmt.Errorf("query watched card: %w", err)
	}
	return membership, false, nil
}

func (repository *Repository) RemoveCard(
	ctx context.Context,
	watchlistID string,
	itemID int64,
) (bool, error) {
	result, err := repository.db.Exec(ctx, `
		DELETE FROM watchlist_card_items
		WHERE watchlist_id = $1 AND id = $2
	`, watchlistID, itemID)
	if err != nil {
		return false, fmt.Errorf("remove watched card: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func (repository *Repository) AddSet(
	ctx context.Context,
	watchlistID string,
	target SetTarget,
) (SetMembership, bool, error) {
	if ok, err := repository.exists(ctx, watchlistID); err != nil {
		return SetMembership{}, false, err
	} else if !ok {
		return SetMembership{}, false, ErrWatchlistNotFound
	}

	var membership SetMembership
	err := repository.db.QueryRow(ctx, `
		INSERT INTO watchlist_set_items (watchlist_id, set_id, edition)
		SELECT $1, $2, $3
		WHERE EXISTS (
			SELECT 1
			FROM catalog_sets catalog_set
			WHERE catalog_set.id = $2
			  AND (
				EXISTS (
					SELECT 1
					FROM catalog_cards card
					JOIN catalog_price_quality quality ON quality.card_id = card.id
					WHERE card.set_id = catalog_set.id
					  AND quality.edition = $3
				)
				OR EXISTS (
					SELECT 1
					FROM catalog_set_printing_memberships membership
					WHERE membership.set_id = catalog_set.id
					  AND membership.catalog_edition = $3
				)
			  )
		)
		ON CONFLICT (watchlist_id, set_id, edition) DO NOTHING
		RETURNING id, set_id, edition
	`, watchlistID, target.SetID, target.Edition).Scan(
		&membership.ItemID,
		&membership.SetID,
		&membership.Edition,
	)
	if err == nil {
		return membership, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return SetMembership{}, false, fmt.Errorf("add watched set: %w", err)
	}

	err = repository.db.QueryRow(ctx, `
		SELECT id, set_id, edition
		FROM watchlist_set_items
		WHERE watchlist_id = $1 AND set_id = $2 AND edition = $3
	`, watchlistID, target.SetID, target.Edition).Scan(
		&membership.ItemID,
		&membership.SetID,
		&membership.Edition,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return SetMembership{}, false, ErrSetEditionMissing
	}
	if err != nil {
		return SetMembership{}, false, fmt.Errorf("query watched set: %w", err)
	}
	return membership, false, nil
}

func (repository *Repository) RemoveSet(
	ctx context.Context,
	watchlistID string,
	itemID int64,
) (bool, error) {
	result, err := repository.db.Exec(ctx, `
		DELETE FROM watchlist_set_items
		WHERE watchlist_id = $1 AND id = $2
	`, watchlistID, itemID)
	if err != nil {
		return false, fmt.Errorf("remove watched set: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func (repository *Repository) exists(ctx context.Context, watchlistID string) (bool, error) {
	var exists bool
	if err := repository.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM watchlists WHERE id = $1)
	`, watchlistID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check watchlist: %w", err)
	}
	return exists, nil
}
