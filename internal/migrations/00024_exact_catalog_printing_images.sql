-- +goose Up
CREATE FUNCTION catalog_recognition_image_url(
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

-- +goose Down
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

DROP FUNCTION catalog_recognition_image_url(text, text, text, text);
