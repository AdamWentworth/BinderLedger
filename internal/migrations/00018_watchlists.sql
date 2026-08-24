-- +goose Up
CREATE TABLE watchlists (
    id text PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX watchlists_single_default_idx
    ON watchlists (is_default)
    WHERE is_default;

CREATE UNIQUE INDEX watchlists_name_lower_idx
    ON watchlists ((lower(name)));

INSERT INTO watchlists (id, name, is_default)
VALUES ('default', 'Watchlist', true);

CREATE TABLE watchlist_card_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    watchlist_id text NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    card_id text NOT NULL REFERENCES catalog_cards(id) ON DELETE CASCADE,
    edition text NOT NULL CHECK (length(btrim(edition)) BETWEEN 1 AND 50),
    finish text NOT NULL CHECK (length(btrim(finish)) BETWEEN 1 AND 50),
    language text NOT NULL CHECK (length(btrim(language)) BETWEEN 1 AND 50),
    added_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (watchlist_id, card_id, edition, finish, language)
);

CREATE INDEX watchlist_card_items_printing_idx
    ON watchlist_card_items (card_id, edition, finish, language);

CREATE TABLE watchlist_set_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    watchlist_id text NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    set_id text NOT NULL REFERENCES catalog_sets(id) ON DELETE CASCADE,
    edition text NOT NULL CHECK (length(btrim(edition)) BETWEEN 1 AND 50),
    added_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (watchlist_id, set_id, edition)
);

CREATE INDEX watchlist_set_items_set_idx
    ON watchlist_set_items (set_id, edition);

-- +goose Down
DROP TABLE watchlist_set_items;
DROP TABLE watchlist_card_items;
DROP TABLE watchlists;
