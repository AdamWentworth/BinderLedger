# Card Image Curation

BinderLedger prefers an exact-printing image over a higher-resolution image of
the wrong printing. Images remain private MVP assets until their use is cleared
for public distribution.

Images that do not yet meet the catalog standard are tracked in
[image-upgrade-list.md](image-upgrade-list.md).

## Bulbapedia Discovery

Use the canonical card page as the image-discovery index:

```text
https://bulbapedia.bulbagarden.net/wiki/<card_name>_(<set_name>_<card_number>)
```

For example, `Lickitung_(Jungle_38)` exposes `LickitungJungle38.jpg` in
the page's MediaWiki image list. Resolve that filename through the Bulbagarden
Archives MediaWiki API and download the original `imageinfo.url`, not a
thumbnail derivative.

The page pattern is a discovery convention, not proof of an exact printing.
Some pages combine holo and non-holo releases, and some archive files show a
First Edition card even when the page also describes Unlimited. Verify the
visible card before activation:

- The printed set number must match the catalog card.
- Base Set First Edition must show the First Edition stamp and must not show the
  later drop shadow beside the artwork frame.
- Jungle Unlimited must not have a First Edition stamp.
- Base Set Shadowless must not have a First Edition stamp and its copyright
  line must include `1995, 96, 98, 99`.
- Base Set Unlimited must have the later artwork-frame shadow and no First
  Edition stamp, except for the deck-exclusive Machamp described below.
- Holofoil and normal printings must not be interchanged.
- The complete card border must be visible without a watermark.

Record the Bulbapedia page URL, Archives original URL, SHA-256 checksum,
dimensions, and verification time in `catalog_printing_images`. Put the
checksum in a replacement filename because card images use immutable HTTP
caching.

## Quality Thresholds

- Hard minimum: 150x200 portrait image.
- Normal catalog baseline: about 322x450.
- Preferred archive scan: at least 350x495.
- Ideal detail image: at least 700x990.

Dimensions do not excuse blur, aggressive upscaling, a poor crop, skew, or a
wrong printing. Every replacement requires visual review.

## Known Exceptions

- Base Set First Edition keeps its exact-printing TCGplayer provider images by
  default. Do not include `base-first-edition` in an automated PriceCharting
  image run; replace an individual card only after comparing visual quality.
- Every standard English Base Set Machamp is stamped First Edition. The
  shadowless-layout printing belongs to the First Edition set and is shared
  into the Shadowless checklist. The later shadowed printing belongs to the
  Unlimited checklist and remains visibly labeled First Edition.
- `Wigglytuff_(Jungle_32)` redirects to the combined Wigglytuff article, whose
  archive image is the #16 holo card. No `WigglytuffJungle32.jpg` file exists.
- `DodrioJungle34.jpg` is First Edition and cannot represent Jungle Unlimited.
- The current Bulbagarden Alakazam #1, Super Energy Removal #79, and Pokemon
  Breeder #76 images are Base Set Unlimited; their copyright lines omit the
  extra `99`, so they cannot represent Base Set Shadowless.

## Current Coverage

The Kanto MVP catalog has 516 verified exact-printing references:

| Catalog group | Verified references |
| --- | ---: |
| Base Set First Edition | 103 |
| Base Set Shadowless | 102 |
| Base Set Unlimited | 102 |
| Jungle Unlimited | 64 |
| Fossil Unlimited | 62 |
| Team Rocket Unlimited | 83 |

The Base Set batch was checked by layout family: all First Edition Pokemon,
Trainer, and Energy images visibly contain their stamps; all ordinary Unlimited
images are unstamped; and the later shadowed Machamp is the sole stamped
Unlimited-checklist exception. Five low-resolution PriceCharting Trainer images
and the later Machamp image use their exact TCGplayer product images instead.
