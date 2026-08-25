# Card Image Upgrade List

Last audited: 2026-08-23

This is the durable backlog for catalog images that should eventually be
replaced, including with original BinderLedger photography. The original
JustTCG-provided TCGplayer images are the quality floor: the sampled originals
are 319x437 JPEGs with clear text, artwork, and borders.

An image only leaves this list after visual review. Pixel dimensions alone do
not constitute an upgrade; an enlarged blurry scan still fails the baseline.

## Acceptance Standard

- Show the exact set number, edition, finish, and language represented by the
  catalog printing.
- Meet or exceed the visual clarity of the original 319x437 JustTCG images.
- Show the complete card and border, photographed straight-on with even,
  color-neutral lighting.
- Avoid sleeves, glare, watermarks, fingers, strong shadows, perspective skew,
  and distracting backgrounds.
- Prefer a clean card when condition is not the subject of the image.
- Keep an original capture at 1400x1950 or larger when producing our own
  photos, then generate smaller delivery sizes from that source.
- Apply the printing checks in [image-curation.md](image-curation.md) before
  activating a replacement.

## Needs Replacement

| Priority | Card | Current image | Problem | Required replacement |
| --- | --- | --- | --- | --- |
| High | Wigglytuff (32), Jungle 32/64 | PriceCharting, 262x368 | Soft and smaller than the JustTCG baseline. Bulbapedia has no exact #32 archive file. | Unlimited, non-holo #32 with no First Edition stamp. |
| High | Pokemon Breeder, Base Set Shadowless 076/102 | PriceCharting, 716x1000 | Large dimensions but visibly soft/upscaled. The Bulbagarden candidate is Unlimited. | Shadowless normal card with no First Edition stamp and the extra `99` in the copyright line. |
| High | Super Energy Removal, Base Set Shadowless 079/102 | PriceCharting, 729x1000 | Large dimensions but visibly blurry/upscaled. The Bulbagarden candidate is Unlimited. | Shadowless normal card with no First Edition stamp and the extra `99` in the copyright line. |
| High | Magneton (11), Fossil 11/62 | PriceCharting, 180x255 | Correct Unlimited holo, but substantially below the JustTCG clarity baseline. | Unlimited holo #11 with no First Edition stamp. |
| High | Lapras (25), Fossil 25/62 | PriceCharting, 219x300 | Correct Unlimited non-holo, but substantially below the JustTCG clarity baseline. | Unlimited non-holo #25 with no First Edition stamp. |
| High | Muk (28), Fossil 28/62 | PriceCharting, 180x255 | Correct Unlimited non-holo, but substantially below the JustTCG clarity baseline. | Unlimited non-holo #28 with no First Edition stamp. |
| High | Dark Flareon, Team Rocket 35/82 | PriceCharting, 240x330 | Correct Unlimited card, but substantially below the JustTCG clarity baseline. | Unlimited #35 with no First Edition stamp. |
| High | Dark Wartortle, Team Rocket 46/82 | PriceCharting, 240x330 | Correct Unlimited card, but substantially below the JustTCG clarity baseline. | Unlimited #46 with no First Edition stamp. |
| Medium | Dodrio, Jungle 34/64 | PriceCharting, 291x400 | Correct and usable, but slightly below the JustTCG size and clarity baseline. The Bulbagarden image is First Edition. | Unlimited, non-holo #34 with no First Edition stamp. |
| Medium | 15 Fossil Unlimited cards: Gengar 05, Hitmonlee 22, Magneton 26, Graveler 37, Magmar 39, Omastar 40, Slowbro 43, Ekans 46, Geodude 47, Kabuto 50, Krabby 51, Omanyte 52, Psyduck 53, Shellder 54, Slowpoke 55 | PriceCharting, 263-291px wide | Correct and usable, but slightly below the JustTCG size and clarity baseline. | Exact Unlimited printing at 319x437 or better. |
| Medium | 2 Fossil Unlimited cards: Mr. Fuji 58 and Recycle 61 | PriceCharting, 291x400 | Correct and usable, but slightly below the JustTCG size and clarity baseline. | Exact Unlimited printing at 319x437 or better. |
| Medium | 8 Team Rocket Unlimited cards: Dark Slowbro 29, Dark Primeape 43, Ekans 56, Magnemite 60, Mankey 61, Challenge! 74, Nightly Garbage Run 77, Goop Gas Attack 78 | PriceCharting, 286-291px wide | Correct and usable, but slightly below the JustTCG size and clarity baseline. | Exact Unlimited printing at 319x437 or better. |
| Medium | 3 Team Rocket Unlimited cards: Sleep! 79, Full Heal Energy 81, and Potion Energy 82 | PriceCharting, 287-291px wide | Correct and usable, but slightly below the JustTCG size and clarity baseline. | Exact Unlimited printing at 319x437 or better. |

## Cosmetic Upgrade

| Priority | Card | Current image | Problem | Preferred replacement |
| --- | --- | --- | --- | --- |
| Low | Wigglytuff (16), Jungle 16/64 | Bulbagarden Archives, 1476x2088 | Correct and high resolution, but the photographed card has prominent surface wear and scratches. | A clean Unlimited holo #16 with no First Edition stamp. |

## Completed Upgrades

| Completed | Card | Replacement | Resolution |
| --- | --- | --- | --- |
| 2026-08-24 | Alakazam, Base Set First Edition 001/102 | TCGplayer, 731x1000 | Restored the original provider image by owner preference after reviewing the alternate PriceCharting scan. |
| 2026-08-24 | Venusaur, Charmander, and Impostor Professor Oak, Base Set First Edition | TCGplayer | Restored the sharper provider images after the automated PriceCharting batch selected visibly inferior alternatives. |
| 2026-08-24 | Charizard, Base Set First Edition 004/102 | TCGplayer, 731x1000 | Restored the sharper provider image after the larger PriceCharting scan proved visibly soft and washed out. |
| 2026-08-24 | Machamp, Base Set Shadowless 008/102 | Sports Card Investor | Replaced the softer PriceCharting image with a verified 1400x1960 delivery image showing the First Edition stamp, shadowless frame, and `1995, 96, 98, 99` copyright line. |
| 2026-08-23 | Pikachu (Red Cheeks), Base Set First Edition 058/102 | PriceCharting, 1070x1494 | Added an exact-printing scan that clearly shows both red cheeks and the First Edition stamp. |
| 2026-08-23 | Alakazam, Base Set Shadowless 001/102 | 401 Games, 322x450 | Replaced the soft 358x500 PriceCharting image with a sharper exact-printing holo. |

## Review Notes

- Do not replace a correct image merely because another source has more
  pixels. Edition accuracy comes first.
- Preserve source URL, dimensions, SHA-256 checksum, and verification time in
  `catalog_printing_images` for every accepted replacement.
- Remove an entry only after the replacement is active, visually verified, and
  included in the separate `data/card-images` backup.
