from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from binderledger_vision.matcher import Reference, ReferenceMatcher, normalize_scan


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
