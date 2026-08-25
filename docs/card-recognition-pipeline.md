# Card Recognition Pipeline

## Objective

Match a photographed card front to an exact BinderLedger catalog printing, then
ask the user to confirm the result. Condition assessment is a later, separate
prediction that uses both sides and never presents itself as a professional
grade.

The first release should run locally without a paid vision API.

## Components

- The Expo client captures the card and displays ranked matches for confirmation.
- The Go API owns scan sessions, queues work, exposes results, and records the
  confirmed catalog card.
- A small Python vision worker performs image processing. It runs one job at a
  time and can stop when idle so it does not compete with the server workloads.
- PostgreSQL stores scan state, candidate scores, the chosen card, model version,
  and user feedback. Original images remain in private filesystem storage.

Redis, a message broker, and a vector database are unnecessary at the current
catalog size. PostgreSQL row locking is enough for the initial job queue.

## Recognition Stages

1. **Normalize the photograph.** Detect the four card edges, correct perspective,
   rotate to portrait, crop the border, and normalize brightness and size.
2. **Generate candidates.** Compare the normalized front with precomputed visual
   features from each curated catalog image. Start with OpenCV ORB feature
   matching, perceptual hashes, and color histograms.
3. **Read printed evidence.** Run OCR on fixed regions for the card name and
   collector number. Use these values to reject visually similar but impossible
   candidates.
4. **Resolve the printing.** Inspect targeted regions for the first-edition stamp,
   Base Set shadow, set symbol, and holo/non-holo layout. This stage is essential
   because broad image similarity can identify Charizard while still choosing
   the wrong edition.
5. **Rank and calibrate.** Combine the independent scores and retain the best
   candidates. Auto-suggest only when the top result clears an empirically tested
   threshold and has a healthy margin over second place.
6. **Confirm.** Show up to three candidates. The user confirms one, searches
   manually, or marks the scan incorrect. Store that feedback for evaluation and
   later model training.

## Delivery Plan

### 1. Evaluation Harness - Next

- Photograph 30-50 cards under realistic lighting, glare, sleeves, and angles.
- Include difficult pairs: first edition versus unlimited, shadowless versus
  unlimited, holo versus non-holo, and cards sharing artwork.
- Keep these fixtures private and record the expected exact catalog card.
- Measure top-1 exact-printing accuracy, top-3 recall, abstention rate, and
  processing time. Do not tune against the same images used for final testing.

### 2. Classical Vision Baseline - Implemented

- `services/vision` uses OpenCV and Tesseract in its deployed container.
- Build and cache reference features whenever catalog images change. The worker
  currently loads all 780 verified catalog printings.
- Add scan job and candidate tables plus worker claim/complete operations.
- Return ranked candidates to the Expo review screen.
- Process one scan at a time. End-to-end latency includes the three-second queue
  polling interval; performance should be remeasured against the complete
  780-reference cache and realistic phone photographs.

### 3. Exact Printing Rules - In Progress

- Add small, testable region detectors for edition stamps, set symbols, and
  Base Set layout differences.
- Track a reference-image quality flag. A printing with an incorrect or weak
  reference image cannot be auto-suggested.
- Add more real phone photographs to the evaluation set as failures appear.

The baseline compares dedicated edition and collector-number regions and only
loads database references marked verified. Broader phone-photo evaluation and
more curated first-edition images are still required.

### 4. Learned Image Features - Deferred

Only add an ONNX image-embedding model if the classical baseline misses too many
real photographs. Run inference on demand on CPU and compare embeddings exactly
in memory while the catalog remains small. Add pgvector only when catalog scale
or query volume makes it useful.

### 5. Condition Suggestions

Condition is a separate project and requires trustworthy labeled examples. Begin
with explainable observations such as corner wear, edge whitening, creases,
surface scratches, centering, and image-quality warnings. Later train a model on
confirmed BinderLedger examples and return a condition range with confidence,
not a definitive grade.

## Data To Record

For each recognition attempt, retain:

- scan ID and processing/model version;
- normalization quality and rejection reason;
- candidate card IDs with component and combined scores;
- suggested and user-confirmed card IDs;
- processing duration and timestamps;
- whether the user rejected every suggestion.

This makes model changes measurable and prevents a visually convincing demo from
masking exact-printing mistakes.

## Cost And Operations

OpenCV, Tesseract, ONNX Runtime, and the proposed application code can all run
locally without per-scan fees. At BinderLedger's current scale, the existing
database and filesystem are sufficient. Costs are limited to the machine's
existing electricity and storage.

Possible later costs are optional GPU time for condition-model experiments,
larger backup storage, and mobile-store developer fees. The main investment for
condition prediction is not API usage; it is collecting and labeling reliable
training photographs.

Reference-image licensing should be reviewed before public or commercial
distribution even when the recognition software itself is free.

## Useful References

- OpenCV feature matching and homography:
  https://docs.opencv.org/5.0/py_tutorials/py_features/py_feature_homography/py_feature_homography.html
- Tesseract OCR documentation: https://tesseract-ocr.github.io/tessdoc/
- ONNX Runtime installation: https://onnxruntime.ai/docs/install/
- pgvector, if catalog scale eventually warrants it:
  https://github.com/pgvector/pgvector
