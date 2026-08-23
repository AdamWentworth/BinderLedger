# Personal catalog inventory

BinderLedger's future collection import source is stored outside the repository at:

`//tnas-98b9.local/public/all_my_cards.csv`

The file was inspected on 2026-08-23 but has not been copied into the repository or imported into the database.

## Current shape

- 603 holding rows and 605 total cards
- 19 folders
- 52 named sets
- Ownership fields include folder, quantity, trade quantity, set, card number, condition, printing, language, purchase price, and purchase date
- 594 cards are marked NearMint; the remaining entries use Excellent, LightPlayed, Mint, or Good
- 568 cards are Normal, 22 are Reverse Holo, and 15 are 1st Edition

## Largest folders

| Folder | Cards |
| --- | ---: |
| EX Era cards | 99 |
| Base Set 100% | 96 |
| Team Rocket 100% | 83 |
| Jungle Set 100% | 64 |
| Fossil Set 100% | 62 |
| Firered Leafgreen | 49 |
| Diamond & Pearl | 34 |
| Neo Era cards | 20 |
| Black Star Promos | 14 |
| Shadowless Base Set | 12 |

## Import boundary

The first collection import should wait until the catalog covers the intended Wizards of the Coast through EX-era scope. Diamond & Pearl and newer rows should remain available in the source CSV but be excluded from the initial BinderLedger import. Conditions must be mapped deliberately to the app's NM, LP, MP, HP, and Damaged scale rather than treating every row as Near Mint.
