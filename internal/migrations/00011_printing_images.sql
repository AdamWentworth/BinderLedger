-- +goose Up
CREATE TABLE catalog_printing_images (
    card_id text NOT NULL REFERENCES catalog_cards(id) ON DELETE CASCADE,
    edition text NOT NULL,
    finish text NOT NULL,
    language text NOT NULL,
    filename text NOT NULL UNIQUE,
    source_name text NOT NULL,
    source_page_url text NOT NULL,
    source_image_url text NOT NULL,
    sha256 text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    verified_at timestamptz,
    collected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, edition, finish, language),
    CONSTRAINT catalog_printing_images_dimensions_positive
        CHECK (width > 0 AND height > 0)
);

CREATE FUNCTION catalog_printing_image_url(
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
DROP FUNCTION catalog_printing_image_url(text, text, text, text);
DROP TABLE catalog_printing_images;
