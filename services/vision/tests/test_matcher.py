from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from binderledger_vision.matcher import (
    Reference,
    ReferenceMatcher,
    detect_card_quad,
    normalize_scan,
    number_similarity,
)


def test_matches_perspective_photo_to_reference(tmp_path: Path) -> None:
    expected = draw_card((36, 120, 220), "ALAKAZAM", "1/102", 7)
    distractor = draw_card((190, 90, 35), "BLASTOISE", "2/102", 13)
    cv2.imwrite(str(tmp_path / "alakazam.jpg"), expected)
    cv2.imwrite(str(tmp_path / "blastoise.jpg"), distractor)

    references = [
        Reference("alakazam", "Alakazam", "1/102", "Base Set", "Unlimited", "Holofoil", "English", "alakazam.jpg"),
        Reference("blastoise", "Blastoise", "2/102", "Base Set", "Unlimited", "Holofoil", "English", "blastoise.jpg"),
    ]
    matcher = ReferenceMatcher(tmp_path, references, tesseract_enabled=False)

    query = photograph(expected)
    matches = matcher.match(query)

    assert matcher.reference_count == 2
    assert matches[0].reference.card_id == "alakazam"
    assert matches[0].score > matches[1].score
    assert matches[0].signals["normalization"] == "detected"


def test_normalize_scan_falls_back_when_no_card_boundary() -> None:
    image = np.full((700, 900, 3), 128, dtype=np.uint8)
    normalized, method = normalize_scan(image)
    assert normalized.shape == (504, 360, 3)
    assert method == "center-crop"


def test_missing_stamp_prefers_shadowless_over_sharper_first_edition_reference(tmp_path: Path) -> None:
    first_edition = draw_printing(first_edition=True)
    shadowless = draw_printing(first_edition=False)
    # Catalog images are not guaranteed to have equal source resolution or sharpness.
    softer_shadowless = cv2.GaussianBlur(shadowless, (9, 9), 0)
    cv2.imwrite(str(tmp_path / "first-edition.jpg"), first_edition)
    cv2.imwrite(str(tmp_path / "shadowless.jpg"), softer_shadowless)

    references = [
        Reference(
            "squirtle-first-edition",
            "Squirtle",
            "63/102",
            "Base Set First Edition",
            "First Edition",
            "Normal",
            "English",
            "first-edition.jpg",
        ),
        Reference(
            "squirtle-shadowless",
            "Squirtle",
            "63/102",
            "Base Set Shadowless",
            "Shadowless",
            "Normal",
            "English",
            "shadowless.jpg",
        ),
    ]
    matcher = ReferenceMatcher(tmp_path, references, tesseract_enabled=False)

    matches = matcher.match(photograph_in_toploader(shadowless))

    assert matches[0].reference.edition == "Shadowless"
    assert matches[0].signals["firstEditionStamp"] < 0.5
    assert matches[0].signals["normalization"] == "detected"


def test_present_stamp_prefers_first_edition(tmp_path: Path) -> None:
    first_edition = draw_printing(first_edition=True)
    shadowless = draw_printing(first_edition=False)
    cv2.imwrite(str(tmp_path / "first-edition.jpg"), first_edition)
    cv2.imwrite(str(tmp_path / "shadowless.jpg"), shadowless)
    matcher = ReferenceMatcher(
        tmp_path,
        [
            Reference(
                "squirtle-first-edition",
                "Squirtle",
                "63/102",
                "Base Set First Edition",
                "First Edition",
                "Normal",
                "English",
                "first-edition.jpg",
            ),
            Reference(
                "squirtle-shadowless",
                "Squirtle",
                "63/102",
                "Base Set Shadowless",
                "Shadowless",
                "Normal",
                "English",
                "shadowless.jpg",
            ),
        ],
        tesseract_enabled=False,
    )

    matches = matcher.match(photograph_in_toploader(first_edition))

    assert matches[0].reference.edition == "First Edition"
    assert matches[0].signals["firstEditionStamp"] > 0.5


def test_present_stamp_prefers_market_edition_with_shared_identity_image(tmp_path: Path) -> None:
    unlimited = draw_printing(first_edition=False)
    cv2.imwrite(str(tmp_path / "unlimited.jpg"), unlimited)
    matcher = ReferenceMatcher(
        tmp_path,
        [
            Reference(
                "flareon-19",
                "Flareon (19)",
                "19/64",
                "Jungle",
                "Unlimited",
                "Normal",
                "English",
                "unlimited.jpg",
                ("First Edition",),
            ),
        ],
        tesseract_enabled=False,
    )

    matches = matcher.match(photograph_in_toploader(draw_printing(first_edition=True)))

    assert matches[0].reference.edition == "First Edition"
    assert matches[0].signals["referenceEdition"] == "Unlimited"
    assert matches[0].signals["referenceEditionFallback"] is True
    assert matches[0].signals["firstEditionStamp"] > 0.5


def test_card_detector_ignores_transparent_toploader_outline() -> None:
    photo = photograph_in_toploader(draw_printing(first_edition=False))

    quad = detect_card_quad(photo)

    assert quad is not None
    # The card is roughly half of the canvas; the surrounding top loader is larger.
    detected_area = abs(cv2.contourArea(quad)) / (photo.shape[0] * photo.shape[1])
    assert 0.30 < detected_area < 0.55


def test_collector_number_breaks_same_artwork_printing_tie() -> None:
    assert number_similarity("Flareon retreat cost 19/64", "19/64") == 1.0
    assert number_similarity("Flareon retreat cost 19/64", "03/64") == 0.0


def draw_card(color: tuple[int, int, int], name: str, number: str, marker: int) -> np.ndarray:
    image = np.full((700, 500, 3), 238, dtype=np.uint8)
    cv2.rectangle(image, (5, 5), (494, 694), (30, 30, 30), 10)
    cv2.putText(image, name, (36, 65), cv2.FONT_HERSHEY_SIMPLEX, 1.15, (10, 10, 10), 3, cv2.LINE_AA)
    cv2.rectangle(image, (35, 105), (465, 430), color, -1)
    for index in range(10):
        center = (70 + (index % 5) * 85, 150 + (index // 5) * 185)
        cv2.circle(image, center, 24 + ((index + marker) % 17), (20 + marker * 7, 210 - marker * 4, 75), 4)
        cv2.line(image, (45, 120 + index * 27), (455, 150 + index * 25), (255, 255, 255), 2)
    cv2.putText(image, f"Power marker {marker}", (42, 505), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (20, 20, 20), 2)
    cv2.putText(image, number, (350, 660), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (10, 10, 10), 2)
    return image


def photograph(card: np.ndarray) -> np.ndarray:
    canvas = np.full((1000, 1000, 3), 45, dtype=np.uint8)
    source = np.float32([[0, 0], [499, 0], [499, 699], [0, 699]])
    destination = np.float32([[255, 100], [745, 145], [700, 880], [210, 835]])
    matrix = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(card, matrix, (1000, 1000))
    mask = cv2.warpPerspective(np.full(card.shape[:2], 255, dtype=np.uint8), matrix, (1000, 1000))
    canvas[mask > 0] = warped[mask > 0]
    return canvas


def draw_printing(*, first_edition: bool) -> np.ndarray:
    image = np.full((700, 500, 3), (22, 205, 245), dtype=np.uint8)
    cv2.rectangle(image, (22, 22), (477, 677), (185, 210, 205), -1)
    cv2.putText(image, "SQUIRTLE", (42, 68), cv2.FONT_HERSHEY_SIMPLEX, 1.05, (20, 20, 20), 3)
    cv2.rectangle(image, (42, 88), (458, 352), (205, 160, 95), -1)
    cv2.circle(image, (250, 210), 92, (80, 190, 90), -1)
    cv2.circle(image, (218, 185), 8, (15, 15, 15), -1)
    cv2.circle(image, (282, 185), 8, (15, 15, 15), -1)
    if first_edition:
        cv2.putText(image, "EDITION", (23, 380), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (5, 5, 5), 1)
        cv2.circle(image, (52, 397), 14, (5, 5, 5), 2)
        cv2.putText(image, "1", (47, 404), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (5, 5, 5), 2)
    cv2.putText(image, "Bubble", (88, 405), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (15, 15, 15), 2)
    cv2.line(image, (35, 435), (465, 435), (25, 25, 25), 2)
    cv2.putText(image, "Withdraw", (88, 475), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (15, 15, 15), 2)
    cv2.putText(image, "63/102", (375, 660), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (15, 15, 15), 2)
    return image


def photograph_in_toploader(card: np.ndarray) -> np.ndarray:
    canvas = np.full((1000, 1000, 3), 48, dtype=np.uint8)
    source = np.float32([[0, 0], [499, 0], [499, 699], [0, 699]])
    destination = np.float32([[255, 105], [748, 135], [705, 885], [208, 850]])
    matrix = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(card, matrix, (1000, 1000))
    mask = cv2.warpPerspective(np.full(card.shape[:2], 255, dtype=np.uint8), matrix, (1000, 1000))
    canvas[mask > 0] = warped[mask > 0]
    outer = np.array([[145, 35], [855, 55], [825, 955], [115, 935]], dtype=np.int32)
    cv2.polylines(canvas, [outer], True, (205, 205, 215), 8, cv2.LINE_AA)
    return canvas
