from __future__ import annotations

import logging
import os
import signal
import time
from pathlib import Path

from . import __version__
from .matcher import ReferenceMatcher
from .repository import Repository

LOGGER = logging.getLogger("binderledger.vision")


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    database_url = required_env("DATABASE_URL")
    card_image_directory = Path(os.getenv("CARD_IMAGE_DIR", "/data/card-images"))
    scan_image_directory = Path(os.getenv("SCAN_IMAGE_DIR", "/data/scan-images"))
    poll_seconds = max(1.0, float(os.getenv("VISION_POLL_SECONDS", "3")))
    run_once = env_bool("VISION_ONCE", False)
    tesseract_enabled = env_bool("VISION_TESSERACT_ENABLED", True)

    repository = Repository(database_url)
    recovered = repository.recover_stale_jobs()
    references = repository.references()
    matcher = ReferenceMatcher(
        card_image_directory,
        references,
        tesseract_enabled=tesseract_enabled,
    )
    if matcher.reference_count == 0:
        raise RuntimeError("no verified local reference images are available")
    LOGGER.info(
        "worker ready version=%s references=%d recovered=%d tesseract=%s",
        __version__,
        matcher.reference_count,
        recovered,
        tesseract_enabled,
    )

    stopping = False

    def stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    while not stopping:
        job = repository.claim_job()
        if job is None:
            if run_once:
                return
            time.sleep(poll_seconds)
            continue

        started = time.monotonic()
        try:
            scan_path = safe_scan_path(scan_image_directory, job.storage_key)
            matches = matcher.match_file(scan_path, limit=3)
            repository.complete(job, matches, __version__)
            LOGGER.info(
                "scan complete id=%s purpose=%s matches=%d top_score=%.5f duration_ms=%d",
                job.scan_id,
                job.purpose,
                len(matches),
                matches[0].score if matches else 0.0,
                round((time.monotonic() - started) * 1000),
            )
        except Exception as error:  # A failed scan must not stop the queue.
            LOGGER.exception("scan failed id=%s", job.scan_id)
            repository.fail(job.scan_id, str(error), __version__)

        if run_once:
            return


def safe_scan_path(directory: Path, storage_key: str) -> Path:
    root = directory.resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise ValueError("scan storage key escapes the image directory")
    return path


def required_env(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(f"{key} is required")
    return value


def env_bool(key: str, fallback: bool) -> bool:
    value = os.getenv(key)
    if value is None:
        return fallback
    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    main()
