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
- Jungle Unlimited must not have a First Edition stamp.
- Base Set Shadowless must not have a First Edition stamp and its copyright
  line must include `1995, 96, 98, 99`.
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

- `Wigglytuff_(Jungle_32)` redirects to the combined Wigglytuff article, whose
  archive image is the #16 holo card. No `WigglytuffJungle32.jpg` file exists.
- `DodrioJungle34.jpg` is First Edition and cannot represent Jungle Unlimited.
- The current Bulbagarden Alakazam #1, Super Energy Removal #79, and Pokemon
  Breeder #76 images are Base Set Unlimited; their copyright lines omit the
  extra `99`, so they cannot represent Base Set Shadowless.
