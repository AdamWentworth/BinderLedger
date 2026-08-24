# JustTCG Deck Exclusives Audit

Last audited: 2026-08-23

JustTCG currently groups 508 cards and 2,580 variants under `Deck Exclusives`.
Most are alternate theme-deck printings rather than cards missing from their
numbered sets. BinderLedger must not import the entire provider set into the
normal release chronology.

The local inventory snapshot is stored in the ignored collector output as
`tools/justtcg-audit/output/deck-exclusives-inventory.json`.

## Required Aliases

These cards disappear from Base Set-scoped JustTCG collection and must be
requested by exact TCGplayer product ID, then imported into BinderLedger's
existing Machamp records.

| TCGplayer ID | JustTCG card | BinderLedger printing |
| ---: | --- | --- |
| 107004 | Machamp - 8/102 (Base Set Shadowless) | Base Set First Edition, Shadowless holo |
| 42425 | Machamp - 8/102 | Base Set, later stamped holo |

Both exact-ID responses contain NM, LP, MP, HP, and Damaged prices with 361
available daily history points per condition. Do not create a user-facing
`Deck Exclusives` set for these records.

The `107004` printing is owned by Base Set First Edition and is also a shared
member of the Base Set Shadowless checklist. This fills card 8/102 in both
views without cloning its variants or price history. In the Shadowless view it
must remain visibly labeled First Edition because no ordinary unstamped
shadowless-layout Machamp holo exists. The later shadowed `42425` printing
remains in Base Set Unlimited.

## Legacy Variant Watchlist

The inventory contains 35 additional likely WotC/EX-era deck variants. These
should be compared with the normal set collection before import. They are not
assumed to be missing cards; many deliberately change a card from holo to
non-holo or vice versa.

| Related release | Deck-exclusive products to review |
| --- | --- |
| Legendary Collection | Charizard 3/110 (`118404`), Dark Blastoise 4/110 (`125088`), Dark Raichu 7/110 (`125089`) |
| EX Team Rocket Returns | Azumarill 1/109 (`125066`), Dark Marowak 7/109 (`125065`), Dark Dragonite 15/109 (`97956`), Dark Tyranitar 20/109 (`97957`) |
| EX Unseen Forces | Feraligatr 4/115 (`557368`), Meganium 9/115 (`125051`), Slowbro 13/115 (`557367`), Typhlosion 17/115 (`97709`), Ho-Oh 27/115 (`181559`), Lugia 29/115 (`97708`) |
| EX Deoxys | Camerupt 4/107 (`84089`), Shedinja 14/107 (`228156`), Deoxys 16/107 (`174493`), Rayquaza 22/107 (`43053`) |
| EX Crystal Guardians | Dugtrio 5/100 (`177126`), Blastoise 14/100 (`174489`), Swampert 27/100 (`177124`), Venusaur 28/100 (`177125`) |
| EX Emerald | Blaziken 1/106 (`97710`), Manectric 7/106 (`97711`), Sceptile 10/106 (`88947`), Swampert 11/106 (`89678`) |
| EX Power Keepers | Delcatty 8/108 (`177121`), Gardevoir 9/108 (`177122`), Dusclops 14/108 (`177120`) |
| EX Team Magma vs Team Aqua | Team Aqua's Kyogre 3/95 (`125256`), Team Magma's Groudon 9/95 (`125255`) |
| EX Hidden Legends | Metagross 11/101 (`125058`), Grass Energy 104/109 (`215767`, provider labeling requires review) |
| Likely EX Holon Phantoms | Latias 21/110 (`97087`), Latios 22/110 (`97088`) |
| Likely EX Dragon | Flygon 15/97 (`285693`) |

## Review Procedure

1. Complete and import the normal numbered set first.
2. Compare exact TCGplayer IDs, card numbers, artwork, and foil treatment.
3. Classify the Deck Exclusives product as a required missing card, an optional
   additional printing, or a provider-labeling error.
4. Import required aliases into the canonical set. Model optional printings as
   explicit variants only when BinderLedger is ready to expose deck variants.
5. Never merge historical prices merely by card name and number.
