# Condition Assessment Research Plan

## Status and Scope

This is a proposed research plan for future condition suggestions. It preserves
the useful dataset and experiment details from the original *Pokémon Card
Portfolio MVP: Scanner + 5-Bucket Condition AI Brief*, revised against the
repository on September 7, 2026. The labeling workflow, dataset exports, and
condition models described here remain future work.

The [recognition pipeline](card-recognition-pipeline.md) describes the current
card-identification system. Identification accepts a required front image and
an optional back image. The condition dataset proposed here requires both
sides of each physical card; it does not change that identification flow.

The research target is a useful suggestion among Near Mint, Lightly Played,
Moderately Played, Heavily Played, and Damaged, with uncertainty and human
correction. Professional numerical grades and guaranteed condition assessments
are outside this plan. Two photographs may miss fine scratches, dents, gloss
loss, and other surface damage; record those limitations during evaluation.

## Photo Collection Protocol

Collect one front and one back photograph for each physical card. Use the same
capture process that a future condition feature would ask users to follow.
Angled shots, flash shots, closeups, and tilt videos can be separate later
experiments rather than requirements for the first dataset.

- Fill roughly 70-90% of the frame while keeping all four corners visible.
- Keep the card flat and the camera as parallel to it as practical.
- Use a neutral matte background, consistent lighting, and minimal glare or
  strong shadows.
- Prefer the camera's 1x view, avoid digital zoom, and check focus.
- Remove sleeves or toploaders when safe. Record their presence when retained.
- Preserve private originals as well as processed crops, with image dimensions,
  capture-quality notes, and the processing version.
- Retake unusable photographs. Poor capture quality should not become a Damaged
  condition label.

Reference catalog images support identification. Condition training needs real
photographs of physical cards with independently reviewed labels. Start with
owner-provided scans; later sources might include consented user submissions or
shop partnerships. Follow the [provider and media policy](provider-api-policy.md)
before using third-party images. Photographs, labels, exports, and reviewer
identities belong in private project storage rather than this public repository.

## Labeling Protocol

Give each physical copy a stable `copy_id`, even when several copies share the
same catalog printing. Manually inspect and label each copy. Imported inventory
conditions and model predictions require review before becoming training labels.

### Condition Labels

Use the existing market labels: `Near Mint`, `Lightly Played`,
`Moderately Played`, `Heavily Played`, and `Damaged`. Keep an `unsure` review state separate
from these five classes and exclude unresolved examples from supervised training.

The following examples are a draft labeling guide. Agree on a consistent rubric
and review representative cards before collecting a large dataset; these are
not provider-specific condition standards.

| Label | Working description |
| --- | --- |
| Near Mint | Minimal visible wear, with no obvious crease, stain, or major surface damage. |
| Lightly Played | Light handling wear, such as slight whitening, minor corner wear, or small scuffs. |
| Moderately Played | Clear wear, such as noticeable whitening, multiple worn corners, or visible surface wear. |
| Heavily Played | Extensive wear across edges, corners, or surfaces, potentially including bends or creases. |
| Damaged | Major damage such as tears, water damage, peeling, holes, ink, or severe structural damage. |

Resolve ambiguous boundaries, especially the treatment of creases and dents,
through human review. Record the rubric version so later changes can be audited.

### Defects and Capture Context

Suggested defect tags are `edge_whitening`, `corner_wear`, `surface_scratches`,
`holo_scratches`, `scuffing`, `crease`, `dent`, `bend`, `stain`, `peeling`,
`water_damage`, `ink_or_marker`, and `dirty_surface`.

Record `off_center`, `front_clean`, and `back_clean` as separate observations.
Centering is not automatically evidence of wear. Sleeve presence and
`bad_photo_quality` describe the capture, rather than damage to the card.

For each defect, record its side (`front`, `back`, `both`, or `unknown`) and
severity (`none`, `minor`, `moderate`, `severe`, or `unknown`). Optional summary
fields can capture front/back surface, edge, corner, crease/bend, and centering
severity. An unobservable feature should remain `unknown`, not `none`.

Record reviewer identity, label date, confidence (`low`, `medium`, or `high`),
and notes. Keep corrections and their provenance so a model suggestion can be
distinguished from a human-confirmed label.

## Proposed Dataset Records

These are candidate research/export fields, not implemented database contracts.
Reuse existing scan sessions, images, and confirmed printing identities when
designing the eventual schema; a catalog printing alone does not identify a
physical copy.

### Physical Copy and Review

```text
copy_id
card_id
edition
finish
language
source_inventory_row_id       # optional import provenance
owned_quantity_index          # distinguish copies from the same inventory row
condition_label               # one of the five existing market labels
review_status                 # reviewed or unsure
label_confidence
reviewer_id
label_date
review_notes
rubric_version
created_at
updated_at
```

Card name, set, and collector number can be included in an export for reviewer
convenience, derived from the confirmed catalog identity.

### Image

```text
image_id
copy_id
scan_session_id
side                          # front or back
original_storage_key
processed_storage_key
processing_version
width
height
sleeved_or_toploaded
photo_quality                 # good, acceptable, or bad
lighting_notes
created_at
```

### Defect Observation

```text
defect_id
copy_id
defect_tag
severity
side
notes
```

Keep model version, predictions, confidence, and user decisions separately from
the reviewed condition label. A subsequent prediction must not overwrite the
human label used for evaluation.

## Dataset Coverage

Audit reviewed examples by condition, card printing, finish, and defect before
choosing an experiment. Raw inventory quantity does not establish that there
are enough trustworthy labels to train or evaluate a model.

A collection concentrated in played cards may lack Near Mint and Damaged
examples. Seek examples at both ends of the scale, along with rare defects and
varied photographic conditions. Record limitations for holo/reverse finishes
and other card types poorly represented in the dataset. A small collection can
support a pilot; production usefulness must be established by evaluation.

## Model Experiments

Compare three condition classifiers on the same reviewed physical cards:

1. Back image only.
2. Front image only.
3. Front and back together.

The back-only experiment tests whether the border and simpler artwork make
wear easier to learn. Treat that as a hypothesis rather than an assumed result.

A candidate paired model uses a small pretrained image encoder for each side,
concatenates the embeddings, and predicts probabilities for the five classes.
Select the encoder through measured accuracy, latency, and resource use; this
plan does not require a particular framework, GPU, or new service.

After a useful baseline exists, investigate auxiliary predictions for edge
whitening, corner wear, scratches, creases, and stains. Display defect reasons
only when supported by those observations or evaluated predictions. Keep image
quality and centering observations distinguishable from wear predictions.

## Correction and Retraining

1. Manually label and review a starter dataset.
2. Train and version a baseline model.
3. Run it on new examples and collect proposed labels separately.
4. Route uncertain predictions, rare defects, and disagreements for review.
5. Preserve the accepted label, correction history, and reviewer confidence.
6. Retrain on reviewed additions and compare against the previous model.

Model-generated labels are not ground truth. Any later pseudo-labeling
experiment must track its provenance and be evaluated separately, so errors
such as mistaking glare for scratches do not reinforce themselves.

## Evaluation

Split by physical `copy_id`. Both sides, repeated captures, crops, and augmented
versions of the same card must stay in the same partition.

A starting split is 70% training, 15% validation, and 15% test, stratified by
condition where the available sample counts permit. Record class counts and
keep the test set fixed and outside training and threshold selection. If a
class has too few examples, collect more and report the limitation.

Track:

- Overall accuracy and per-condition precision and recall.
- The confusion matrix, particularly LP/MP and MP/HP boundary errors.
- Near Mint versus other-condition performance and severe-damage recall.
- Confidence calibration, abstention rate, and accuracy at each chosen
  confidence threshold.
- Performance across capture quality, sleeves, finishes, and defect types.
- Processing time and resource use on the intended hardware.

Choose confidence thresholds using validation results. High-confidence results
may show a suggestion, intermediate results may show a condition range, and
low-confidence results should request manual selection or a better photograph.
Always allow correction. Use wording such as "Suggested condition" and avoid
professional-grade or guaranteed-accuracy claims.

## Delivery Sequence

1. Agree on the draft condition rubric and calibrate reviewers on sample cards.
2. Define private storage and export records, then capture and review a pilot.
3. Audit dataset coverage and create a reproducible split by physical copy.
4. Compare the three input configurations and inspect their error patterns.
5. Set evidence-based confidence thresholds before adding condition suggestions
   to the product. Preserve user-confirmed conditions for collection valuation.

Use BinderLedger's existing condition-specific pricing and provider policy for
valuation.
