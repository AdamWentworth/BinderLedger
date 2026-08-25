from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np

TARGET_WIDTH = 360
TARGET_HEIGHT = 504
CARD_ASPECT = TARGET_WIDTH / TARGET_HEIGHT


@dataclass(frozen=True)
class Reference:
    card_id: str
    card_name: str
    number: str | None
    set_name: str
    edition: str
    finish: str
    language: str
    filename: str


@dataclass
class Features:
    gray: np.ndarray
    keypoints: list[cv2.KeyPoint]
    descriptors: np.ndarray | None
    perceptual_hash: np.ndarray
    histogram: np.ndarray
    stamp_region: np.ndarray
    number_region: np.ndarray
    first_edition_stamp: float
    shadow_region: np.ndarray
    copyright_region: np.ndarray


@dataclass(frozen=True)
class Match:
    reference: Reference
    score: float
    signals: dict[str, Any]


class ReferenceMatcher:
    def __init__(
        self,
        reference_directory: Path,
        references: Iterable[Reference],
        *,
        tesseract_enabled: bool = True,
    ) -> None:
        cv2.setNumThreads(1)
        self._reference_directory = reference_directory
        self._tesseract_enabled = tesseract_enabled
        self._orb = cv2.ORB_create(
            nfeatures=900,
            scaleFactor=1.2,
            nlevels=8,
            edgeThreshold=12,
            fastThreshold=12,
        )
        self._references: list[tuple[Reference, Features]] = []
        for reference in references:
            image = cv2.imread(str(reference_directory / reference.filename), cv2.IMREAD_COLOR)
            if image is None:
                continue
            normalized = normalize_reference(image)
            self._references.append((reference, self._features(normalized)))

    @property
    def reference_count(self) -> int:
        return len(self._references)

    def match_file(self, path: Path, limit: int = 3) -> list[Match]:
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"scan image could not be decoded: {path.name}")
        return self.match(image, limit=limit)

    def match(self, image: np.ndarray, limit: int = 3) -> list[Match]:
        if not self._references:
            return []

        normalized, normalization = normalize_scan(image)
        orientations = [normalized, cv2.rotate(normalized, cv2.ROTATE_180)]
        query_features = [self._features(item) for item in orientations]
        ocr_text = self._extract_best_text(orientations)

        shortlist: list[tuple[float, Reference, Features, Features]] = []
        for reference, reference_features in self._references:
            for features in query_features:
                shortlist.append(
                    (
                        self._prefilter_score(features, reference_features, ocr_text, reference),
                        reference,
                        features,
                        reference_features,
                    )
                )
        shortlist.sort(key=lambda item: item[0], reverse=True)

        matches_by_printing: dict[tuple[str, str, str, str], Match] = {}
        for _, reference, features, reference_features in shortlist[:48]:
            score, signals = self._score(features, reference_features, ocr_text, reference)
            signals["normalization"] = normalization
            if ocr_text:
                signals["ocrText"] = ocr_text[:240]
            match = Match(reference=reference, score=round(score, 5), signals=signals)
            key = (reference.card_id, reference.edition, reference.finish, reference.language)
            current = matches_by_printing.get(key)
            if current is None or match.score > current.score:
                matches_by_printing[key] = match

        matches = list(matches_by_printing.values())
        matches = self._rerank_printings(matches)
        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[: max(1, min(limit, 3))]

    @staticmethod
    def _rerank_printings(matches: list[Match]) -> list[Match]:
        """Use printing-only details after the card identity has been established.

        Whole-card feature matching is intentionally the strongest signal for card
        identity, but it can favor a sharper reference image over the right Base Set
        printing.  Only sibling references for the same catalog card are adjusted
        here, and only when that group contains a First Edition printing.
        """

        editions_by_card: dict[str, set[str]] = {}
        for match in matches:
            editions_by_card.setdefault(match.reference.card_id, set()).add(match.reference.edition.lower())

        reranked: list[Match] = []
        for match in matches:
            editions = editions_by_card[match.reference.card_id]
            if len(editions) < 2 or not any("first" in edition for edition in editions):
                reranked.append(match)
                continue

            signals = dict(match.signals)
            observed_stamp = float(signals["firstEditionStamp"])
            stamp_score = observed_stamp if "first" in match.reference.edition.lower() else 1.0 - observed_stamp
            region_score = (
                0.65 * float(signals["shadowRegion"])
                + 0.35 * float(signals["copyrightRegion"])
            )
            printing_score = clamp(0.55 * stamp_score + 0.45 * region_score)
            adjusted_score = clamp(0.68 * match.score + 0.32 * printing_score)
            signals["baseScore"] = match.score
            signals["printingScore"] = round(printing_score, 5)
            reranked.append(Match(match.reference, round(adjusted_score, 5), signals))
        return reranked

    def _prefilter_score(
        self,
        query: Features,
        reference: Features,
        ocr_text: str,
        metadata: Reference,
    ) -> float:
        phash = hash_similarity(query.perceptual_hash, reference.perceptual_hash)
        histogram = float(cv2.compareHist(query.histogram, reference.histogram, cv2.HISTCMP_CORREL))
        histogram = clamp((histogram + 1.0) / 2.0)
        stamp = region_similarity(query.stamp_region, reference.stamp_region)
        number_region = region_similarity(query.number_region, reference.number_region)
        visual = 0.40 * phash + 0.25 * histogram + 0.20 * stamp + 0.15 * number_region
        if not ocr_text:
            return visual
        title = title_similarity(ocr_text, metadata.card_name)
        number = number_similarity(ocr_text, metadata.number)
        return 0.78 * visual + 0.15 * title + 0.07 * number

    def _features(self, image: np.ndarray) -> Features:
        raw_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(raw_gray)
        keypoints, descriptors = self._orb.detectAndCompute(gray, None)

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        histogram = cv2.calcHist([hsv], [0, 1], None, [18, 16], [0, 180, 0, 256])
        cv2.normalize(histogram, histogram)

        return Features(
            gray=gray,
            keypoints=keypoints,
            descriptors=descriptors,
            perceptual_hash=perceptual_hash(gray),
            histogram=histogram,
            stamp_region=crop_ratio(gray, 0.04, 0.37, 0.35, 0.60),
            number_region=crop_ratio(gray, 0.53, 0.82, 0.99, 0.995),
            first_edition_stamp=first_edition_stamp_presence(
                crop_ratio(raw_gray, 0.035, 0.51, 0.17, 0.58)
            ),
            shadow_region=crop_ratio(gray, 0.82, 0.10, 0.96, 0.56),
            copyright_region=crop_ratio(gray, 0.03, 0.91, 0.97, 0.99),
        )

    def _score(
        self,
        query: Features,
        reference: Features,
        ocr_text: str,
        metadata: Reference,
    ) -> tuple[float, dict[str, Any]]:
        orb = orb_similarity(query, reference)
        phash = hash_similarity(query.perceptual_hash, reference.perceptual_hash)
        histogram = float(cv2.compareHist(query.histogram, reference.histogram, cv2.HISTCMP_CORREL))
        histogram = clamp((histogram + 1.0) / 2.0)
        stamp = region_similarity(query.stamp_region, reference.stamp_region)
        number_region = region_similarity(query.number_region, reference.number_region)
        shadow_region = region_similarity(query.shadow_region, reference.shadow_region)
        copyright_region = region_similarity(query.copyright_region, reference.copyright_region)

        visual = (
            0.46 * orb
            + 0.20 * phash
            + 0.14 * histogram
            + 0.12 * stamp
            + 0.08 * number_region
        )
        title = title_similarity(ocr_text, metadata.card_name) if ocr_text else 0.0
        number = number_similarity(ocr_text, metadata.number) if ocr_text else 0.0
        if ocr_text:
            score = 0.82 * visual + 0.12 * title + 0.06 * number
        else:
            score = visual

        signals: dict[str, Any] = {
            "visual": round(visual, 5),
            "orb": round(orb, 5),
            "perceptualHash": round(phash, 5),
            "color": round(histogram, 5),
            "editionRegion": round(stamp, 5),
            "numberRegion": round(number_region, 5),
            "firstEditionStamp": round(query.first_edition_stamp, 5),
            "editionStampMatch": round(
                1.0 - abs(query.first_edition_stamp - reference.first_edition_stamp), 5
            ),
            "shadowRegion": round(shadow_region, 5),
            "copyrightRegion": round(copyright_region, 5),
        }
        if ocr_text:
            signals["titleText"] = round(title, 5)
            signals["numberText"] = round(number, 5)
        return clamp(score), signals

    def _extract_best_text(self, images: list[np.ndarray]) -> str:
        if not self._tesseract_enabled:
            return ""
        candidates = [extract_text(image) for image in images]
        return max(candidates, key=lambda value: sum(character.isalnum() for character in value))


def normalize_reference(image: np.ndarray) -> np.ndarray:
    return resize_crop(image, TARGET_WIDTH, TARGET_HEIGHT)


def normalize_scan(image: np.ndarray) -> tuple[np.ndarray, str]:
    if image.size == 0:
        raise ValueError("scan image is empty")
    working = resize_max(image, 1600)
    quad = detect_card_quad(working)
    if quad is not None:
        warped = warp_card(working, quad)
        return resize_crop(warped, TARGET_WIDTH, TARGET_HEIGHT), "detected"
    return resize_crop(working, TARGET_WIDTH, TARGET_HEIGHT), "center-crop"


def detect_card_quad(image: np.ndarray) -> np.ndarray | None:
    color_quad = detect_pokemon_border_quad(image)
    if color_quad is not None:
        return color_quad

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    minimum_area = image.shape[0] * image.shape[1] * 0.12
    candidates: list[tuple[float, np.ndarray]] = []

    for lower, upper in ((30, 90), (45, 135), (70, 200)):
        edges = cv2.Canny(gray, lower, upper)
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:30]:
            area = cv2.contourArea(contour)
            if area < minimum_area:
                break
            perimeter = cv2.arcLength(contour, True)
            polygon = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
            if len(polygon) != 4 or not cv2.isContourConvex(polygon):
                continue
            ordered = order_points(polygon.reshape(4, 2).astype(np.float32))
            score = card_quad_score(ordered, image.shape[:2])
            if score is not None:
                candidates.append((score, ordered))

    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def detect_pokemon_border_quad(image: np.ndarray) -> np.ndarray | None:
    """Find the saturated yellow/gold border common to physical Pokemon cards.

    Transparent sleeves and top loaders often form a cleaner, larger rectangle than
    the card itself.  Looking for the enclosed colored border lets us select the card
    rather than the plastic when both have nearly the same aspect ratio.
    """

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([15, 80, 100]), np.array([40, 255, 255]))
    kernel_size = max(5, round(min(image.shape[:2]) * 0.012))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    minimum_area = image.shape[0] * image.shape[1] * 0.12
    candidates: list[tuple[float, np.ndarray]] = []

    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:12]:
        area = cv2.contourArea(contour)
        if area < minimum_area:
            break
        rectangle = cv2.minAreaRect(contour)
        ordered = order_points(cv2.boxPoints(rectangle).astype(np.float32))
        score = card_quad_score(ordered, image.shape[:2])
        if score is None:
            continue
        rectangularity = clamp(area / max(1.0, float(rectangle[1][0] * rectangle[1][1])))
        candidates.append((score + 0.35 * rectangularity, ordered))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def card_quad_score(points: np.ndarray, image_shape: tuple[int, int]) -> float | None:
    width = max(np.linalg.norm(points[1] - points[0]), np.linalg.norm(points[2] - points[3]))
    height = max(np.linalg.norm(points[3] - points[0]), np.linalg.norm(points[2] - points[1]))
    ratio = min(width, height) / max(width, height)
    if not 0.58 <= ratio <= 0.82:
        return None

    image_height, image_width = image_shape
    area_ratio = abs(float(cv2.contourArea(points))) / (image_width * image_height)
    if not 0.12 <= area_ratio <= 0.92:
        return None
    center = points.mean(axis=0)
    center_distance = np.linalg.norm(
        (center - np.array([image_width / 2.0, image_height / 2.0]))
        / np.array([image_width / 2.0, image_height / 2.0])
    )
    aspect_score = clamp(1.0 - abs(ratio - CARD_ASPECT) / 0.14)
    center_score = clamp(1.0 - float(center_distance))
    area_score = clamp(area_ratio / 0.55)
    return 0.55 * aspect_score + 0.25 * center_score + 0.20 * area_score


def order_points(points: np.ndarray) -> np.ndarray:
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = points.sum(axis=1)
    differences = np.diff(points, axis=1).reshape(-1)
    ordered[0] = points[np.argmin(sums)]
    ordered[2] = points[np.argmax(sums)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def warp_card(image: np.ndarray, points: np.ndarray) -> np.ndarray:
    top_left, top_right, bottom_right, bottom_left = points
    width = int(max(np.linalg.norm(top_right - top_left), np.linalg.norm(bottom_right - bottom_left)))
    height = int(max(np.linalg.norm(bottom_left - top_left), np.linalg.norm(bottom_right - top_right)))
    destination = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(points, destination)
    warped = cv2.warpPerspective(image, matrix, (width, height))
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    return warped


def resize_max(image: np.ndarray, maximum: int) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1.0, maximum / max(height, width))
    if scale == 1.0:
        return image
    return cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


def resize_crop(image: np.ndarray, width: int, height: int) -> np.ndarray:
    source_height, source_width = image.shape[:2]
    source_ratio = source_width / source_height
    target_ratio = width / height
    if source_ratio > target_ratio:
        crop_width = round(source_height * target_ratio)
        left = max(0, (source_width - crop_width) // 2)
        image = image[:, left : left + crop_width]
    else:
        crop_height = round(source_width / target_ratio)
        top = max(0, (source_height - crop_height) // 2)
        image = image[top : top + crop_height, :]
    return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)


def crop_ratio(image: np.ndarray, left: float, top: float, right: float, bottom: float) -> np.ndarray:
    height, width = image.shape[:2]
    return image[
        max(0, round(top * height)) : min(height, round(bottom * height)),
        max(0, round(left * width)) : min(width, round(right * width)),
    ]


def perceptual_hash(gray: np.ndarray) -> np.ndarray:
    resized = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    transformed = cv2.dct(resized)
    low_frequency = transformed[:8, :8]
    median = np.median(low_frequency.reshape(-1)[1:])
    return low_frequency > median


def hash_similarity(left: np.ndarray, right: np.ndarray) -> float:
    distance = int(np.count_nonzero(left != right))
    return clamp(1.0 - distance / left.size)


def region_similarity(left: np.ndarray, right: np.ndarray) -> float:
    if left.size == 0 or right.size == 0:
        return 0.0
    right = cv2.resize(right, (left.shape[1], left.shape[0]), interpolation=cv2.INTER_AREA)
    score = float(cv2.matchTemplate(left, right, cv2.TM_CCOEFF_NORMED)[0, 0])
    if not np.isfinite(score):
        return 0.0
    return clamp((score + 1.0) / 2.0)


def first_edition_stamp_presence(region: np.ndarray) -> float:
    """Estimate whether the dense black First Edition stamp is present.

    The thresholds are local to the small stamp box, so global exposure differences
    between a catalog scan and a phone photo do not masquerade as a printed stamp.
    """

    if region.size == 0:
        return 0.0
    median = float(np.median(region))
    dark_fraction = float(np.mean(region < median - 30.0))
    edge_fraction = float(np.mean(cv2.Canny(region, 60, 160) > 0))
    dark_score = clamp((dark_fraction - 0.05) / 0.18)
    edge_score = clamp((edge_fraction - 0.035) / 0.12)
    return clamp(0.60 * dark_score + 0.40 * edge_score)


def orb_similarity(query: Features, reference: Features) -> float:
    if query.descriptors is None or reference.descriptors is None:
        return 0.0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(query.descriptors, reference.descriptors, k=2)
    good = [first for first, second in pairs if first.distance < 0.74 * second.distance]
    if len(good) < 4:
        return clamp(len(good) / 25.0)

    source = np.float32([query.keypoints[item.queryIdx].pt for item in good]).reshape(-1, 1, 2)
    target = np.float32([reference.keypoints[item.trainIdx].pt for item in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(source, target, cv2.RANSAC, 5.0)
    inlier_ratio = float(mask.mean()) if mask is not None else 0.0
    match_volume = min(1.0, len(good) / 45.0)
    return clamp(0.55 * match_volume + 0.45 * inlier_ratio)


def extract_text(image: np.ndarray) -> str:
    title = crop_ratio(image, 0.04, 0.02, 0.96, 0.20)
    footer = crop_ratio(image, 0.02, 0.78, 0.98, 0.995)
    width = max(title.shape[1], footer.shape[1])
    title = cv2.resize(title, (width, max(1, round(title.shape[0] * width / title.shape[1]))))
    footer = cv2.resize(footer, (width, max(1, round(footer.shape[0] * width / footer.shape[1]))))
    combined = np.vstack([title, footer])
    gray = cv2.cvtColor(combined, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    encoded, payload = cv2.imencode(".png", gray)
    if not encoded:
        return ""
    try:
        result = subprocess.run(
            ["tesseract", "stdin", "stdout", "--psm", "6", "-l", "eng"],
            input=payload.tobytes(),
            capture_output=True,
            check=False,
            timeout=8,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    if result.returncode != 0:
        return ""
    return " ".join(result.stdout.decode("utf-8", errors="ignore").split())


def normalize_text(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def title_similarity(ocr_text: str, card_name: str) -> float:
    observed = normalize_text(ocr_text)
    expected = normalize_text(re.sub(r"\s*\(\d+\)\s*$", "", card_name))
    if not observed or not expected:
        return 0.0
    if expected in observed:
        return 1.0
    expected_tokens = expected.split()
    observed_tokens = observed.split()
    token_hits = sum(token in observed_tokens for token in expected_tokens) / len(expected_tokens)
    window_size = max(1, len(expected_tokens))
    sequence = max(
        (
            SequenceMatcher(None, expected, " ".join(observed_tokens[index : index + window_size])).ratio()
            for index in range(max(1, len(observed_tokens) - window_size + 1))
        ),
        default=0.0,
    )
    return clamp(max(token_hits, sequence))


def number_similarity(ocr_text: str, number: str | None) -> float:
    if not number:
        return 0.0
    expected_match = re.search(r"0*(\d+)\s*/\s*0*(\d+)", number)
    if not expected_match:
        return 0.0
    expected = (int(expected_match.group(1)), int(expected_match.group(2)))
    for numerator, denominator in re.findall(r"(\d{1,3})\s*[/|]\s*(\d{1,3})", ocr_text):
        if (int(numerator), int(denominator)) == expected:
            return 1.0
    return 0.0


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))
