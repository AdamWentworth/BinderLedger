-- +goose Up
CREATE TABLE catalog_set_printing_memberships (
    set_id text NOT NULL REFERENCES catalog_sets(id) ON DELETE CASCADE,
    card_id text NOT NULL REFERENCES catalog_cards(id) ON DELETE CASCADE,
    catalog_edition text NOT NULL,
    printing_edition text NOT NULL,
    note text,
    PRIMARY KEY (set_id, card_id, catalog_edition, printing_edition)
);

CREATE INDEX catalog_set_printing_memberships_card_idx
    ON catalog_set_printing_memberships (card_id, printing_edition);

INSERT INTO catalog_set_printing_memberships (
    set_id,
    card_id,
    catalog_edition,
    printing_edition,
    note
)
VALUES (
    'base-set-shadowless-pokemon',
    'pokemon-base-set-shadowless-machamp-holo-rare',
    'Shadowless',
    'First Edition',
    'The stamped First Edition Machamp is the only standard shadowless-layout Machamp holo.'
)
ON CONFLICT (set_id, card_id, catalog_edition, printing_edition) DO UPDATE SET
    note = EXCLUDED.note;

-- +goose Down
DROP TABLE catalog_set_printing_memberships;
