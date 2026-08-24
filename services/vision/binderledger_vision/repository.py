from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .matcher import Match, Reference


@dataclass(frozen=True)
class Job:
    scan_id: str
    purpose: str
    storage_key: str


class Repository:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def recover_stale_jobs(self) -> int:
        with self._connect() as connection:
            result = connection.execute(
                """
                UPDATE card_scan_sessions
                SET
                    status = 'captured',
                    processing_started_at = NULL,
                    failure_reason = NULL,
                    updated_at = now()
                WHERE status = 'processing'
                  AND processing_started_at < now() - interval '15 minutes'
                """
            )
            return result.rowcount

    def claim_job(self) -> Job | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                WITH next_job AS (
                    SELECT id
                    FROM card_scan_sessions
                    WHERE status = 'captured'
                    ORDER BY created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE card_scan_sessions session
                SET
                    status = 'processing',
                    processing_started_at = now(),
                    failure_reason = NULL,
                    updated_at = now()
                FROM next_job
                WHERE session.id = next_job.id
                RETURNING session.id, session.purpose
                """
            ).fetchone()
            if row is None:
                return None
            image = connection.execute(
                """
                SELECT storage_key
                FROM card_scan_images
                WHERE scan_session_id = %s AND side = 'front'
                """,
                (row["id"],),
            ).fetchone()
            if image is None:
                raise RuntimeError(f"front image missing for scan {row['id']}")
            return Job(scan_id=row["id"], purpose=row["purpose"], storage_key=image["storage_key"])

    def references(self) -> list[Reference]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    card.id AS card_id,
                    card.name AS card_name,
                    card.number,
                    catalog_set.name AS set_name,
                    image.edition,
                    image.finish,
                    image.language,
                    image.filename
                FROM catalog_printing_images image
                JOIN catalog_cards card ON card.id = image.card_id
                JOIN catalog_sets catalog_set ON catalog_set.id = card.set_id
                WHERE image.verified_at IS NOT NULL
                ORDER BY catalog_set.release_date NULLS LAST, card.number_sort, card.name
                """
            ).fetchall()
        return [Reference(**row) for row in rows]

    def complete(self, job: Job, matches: list[Match], recognizer_version: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM card_scan_candidates WHERE scan_session_id = %s",
                (job.scan_id,),
            )
            for rank, match in enumerate(matches, start=1):
                reference = match.reference
                connection.execute(
                    """
                    INSERT INTO card_scan_candidates (
                        scan_session_id,
                        rank,
                        card_id,
                        edition,
                        finish,
                        language,
                        score,
                        signals
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        job.scan_id,
                        rank,
                        reference.card_id,
                        reference.edition,
                        reference.finish,
                        reference.language,
                        match.score,
                        Jsonb(match.signals),
                    ),
                )
            connection.execute(
                """
                UPDATE card_scan_sessions
                SET
                    status = 'complete',
                    recognizer_version = %s,
                    failure_reason = NULL,
                    completed_at = now(),
                    updated_at = now()
                WHERE id = %s AND status = 'processing'
                """,
                (recognizer_version, job.scan_id),
            )

    def fail(self, scan_id: str, reason: str, recognizer_version: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE card_scan_sessions
                SET
                    status = 'failed',
                    recognizer_version = %s,
                    failure_reason = %s,
                    completed_at = now(),
                    updated_at = now()
                WHERE id = %s
                """,
                (recognizer_version, reason[:500], scan_id),
            )

    def health(self) -> dict[str, Any]:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT
                    count(*) FILTER (WHERE status = 'captured') AS queued,
                    count(*) FILTER (WHERE status = 'processing') AS processing,
                    count(*) FILTER (WHERE status = 'failed') AS failed
                FROM card_scan_sessions
                """
            ).fetchone()

    def _connect(self) -> psycopg.Connection[dict[str, Any]]:
        return psycopg.connect(self._database_url, row_factory=dict_row, connect_timeout=5)
