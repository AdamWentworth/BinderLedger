-- +goose Up
ALTER TABLE catalog_valuation_observations
    DROP CONSTRAINT catalog_valuation_observations_valuation_reference_id_fkey,
    ADD CONSTRAINT catalog_valuation_observations_valuation_reference_id_fkey
        FOREIGN KEY (valuation_reference_id)
        REFERENCES catalog_valuation_references(id)
        ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE catalog_valuation_observations
    DROP CONSTRAINT catalog_valuation_observations_valuation_reference_id_fkey,
    ADD CONSTRAINT catalog_valuation_observations_valuation_reference_id_fkey
        FOREIGN KEY (valuation_reference_id)
        REFERENCES catalog_valuation_references(id)
        ON DELETE CASCADE;
