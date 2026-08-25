-- +goose Up
ALTER TABLE card_scan_candidates
    DROP CONSTRAINT card_scan_candidates_card_id_edition_finish_language_fkey,
    ADD CONSTRAINT card_scan_candidates_card_id_fkey
        FOREIGN KEY (card_id) REFERENCES catalog_cards(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION catalog_printing_image_url(
    requested_card_id text,
    requested_edition text,
    requested_finish text,
    requested_language text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT '/api/catalog/images/' || image.filename
    FROM catalog_printing_images image
    WHERE image.card_id = requested_card_id
      AND image.finish = requested_finish
      AND image.language = requested_language
      AND image.verified_at IS NOT NULL
      AND image.edition IN (requested_edition, 'Unlimited')
    ORDER BY
        (image.edition = requested_edition) DESC,
        (image.edition = 'Unlimited') DESC,
        image.verified_at DESC
    LIMIT 1
$$;

-- +goose Down
DELETE FROM card_scan_confirmations confirmation
USING card_scan_candidates candidate
WHERE confirmation.scan_session_id = candidate.scan_session_id
  AND confirmation.candidate_rank = candidate.rank
  AND NOT EXISTS (
      SELECT 1
      FROM catalog_printing_images image
      WHERE image.card_id = candidate.card_id
        AND image.edition = candidate.edition
        AND image.finish = candidate.finish
        AND image.language = candidate.language
  );

DELETE FROM card_scan_candidates candidate
WHERE NOT EXISTS (
    SELECT 1
    FROM catalog_printing_images image
    WHERE image.card_id = candidate.card_id
      AND image.edition = candidate.edition
      AND image.finish = candidate.finish
      AND image.language = candidate.language
);

ALTER TABLE card_scan_candidates
    DROP CONSTRAINT card_scan_candidates_card_id_fkey,
    ADD CONSTRAINT card_scan_candidates_card_id_edition_finish_language_fkey
        FOREIGN KEY (card_id, edition, finish, language)
        REFERENCES catalog_printing_images (card_id, edition, finish, language)
        ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION catalog_printing_image_url(
    requested_card_id text,
    requested_edition text,
    requested_finish text,
    requested_language text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT '/api/catalog/images/' || image.filename
    FROM catalog_printing_images image
    WHERE image.card_id = requested_card_id
      AND image.edition = requested_edition
      AND image.finish = requested_finish
      AND image.language = requested_language
      AND image.verified_at IS NOT NULL
$$;
