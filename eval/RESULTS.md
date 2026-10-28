# Eval results (run 2)

Run 2026-10-28T08:43:24.246Z. Method in [spec.md](spec.md).

| Method | Mean AUC | Podcasts | Festivals | Teams | Properties won |
| --- | --- | --- | --- | --- | --- |
| Somm Fit Score | 0.49 | 0.51 | 0.52 | 0.42 | 1 |
| Qloo affinity only | 0.49 | 0.49 | 0.55 | 0.42 | 1 |
| Popularity only | 0.43 | 0.44 | 0.45 | 0.41 | 1 |
| Model only (no Qloo) | 0.64 | 0.59 | 0.68 | 0.68 | 18 |
| Negative control | 0.48 | 0.55 | 0.50 | 0.38 | 3 |

Gate traps: **10/11**.

| Trap | Verdict | Age gate | Pass |
| --- | --- | --- | --- |
| gt-rollingloud-hennessy | BLOCKED | block | yes |
| gt-rollingloud-draftkings | BLOCKED | block | yes |
| gt-katseye-michelob | BLOCKED | block | yes |
| gt-katseye-draftkings | BLOCKED | block | yes |
| gt-govball-fanduel | CONSIDER | review | yes |
| ex-coachella-pepsi | BLOCKED | – | yes |
| ex-stagecoach-wrangler | BLOCKED | – | yes |
| ex-dodgers-polymarket | – | – | **no** |
| ex-rollingloud-nike | BLOCKED | – | yes |
| ex-barcelona-adidas | BLOCKED | – | yes |
| ctl-coachella-cocacola | PURSUE | – | yes |

## Per property

| Property | Type | Sponsors / controls matched | Somm | Affinity | Popularity | Model only | Negative control |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Huberman Lab | podcast | 7/10, 4/5 | 0.57 | 0.46 | 0.29 | 0.75 | 0.21 |
| Lex Fridman Podcast | podcast | 5/9, 4/5 | 0.60 | 0.35 | 0.50 | 0.95 | 0.60 |
| The Tim Ferriss Show | podcast | 6/8, 3/5 | 0.42 | 0.56 | 0.28 | 0.94 | 0.67 |
| The Joe Rogan Experience | podcast | 7/8, 5/5 | 0.53 | 0.63 | 0.29 | 0.49 | 0.60 |
| The Bill Simmons Podcast | podcast | 6/6, 5/5 | 0.60 | 0.57 | 0.73 | 0.40 | 0.40 |
| Pardon My Take | podcast | 7/8, 5/5 | 0.44 | 0.49 | 0.40 | 0.49 | 0.63 |
| Call Her Daddy | podcast | 6/8, 5/5 | 0.42 | 0.27 | 0.57 | 0.63 | 0.47 |
| Armchair Expert with Dax Shepard | podcast | 6/6, 5/5 | 0.50 | 0.60 | 0.37 | 0.63 | 0.60 |
| This Week in Startups | podcast | 2/7, 2/5 | 0.50 | 0.50 | 0.50 | 0.00 | 0.75 |
| Coachella Valley Music and Arts Festival | festival | 10/10, 5/5 | 0.48 | 0.50 | 0.38 | 0.82 | 0.50 |
| Lollapalooza (Chicago) | festival | 11/11, 5/5 | 0.66 | 0.53 | 0.53 | 0.78 | 0.42 |
| Austin City Limits Music Festival | festival | 11/11, 5/5 | 0.42 | 0.45 | 0.42 | 0.76 | 0.49 |
| The Governors Ball Music Festival | festival | 11/12, 5/5 | 0.60 | 0.64 | 0.53 | 0.67 | 0.58 |
| Bonnaroo Music & Arts Festival | festival | 7/10, 5/5 | 0.57 | 0.80 | 0.43 | 0.89 | 0.46 |
| Stagecoach Festival | festival | 8/9, 5/5 | 0.63 | 0.60 | 0.42 | 0.35 | 0.53 |
| Primavera Sound Barcelona | festival | 11/11, 4/5 | 0.47 | 0.48 | 0.36 | 0.89 | 0.48 |
| Rolling Loud (Orlando) | festival | 8/8, 5/5 | 0.35 | 0.40 | 0.50 | 0.30 | 0.57 |
| Inter Miami CF | sports_team | 10/10, 6/6 | 0.44 | 0.37 | 0.50 | 0.57 | 0.30 |
| Golden State Warriors | sports_team | 5/7, 5/5 | 0.28 | 0.28 | 0.44 | 0.72 | 0.48 |
| Los Angeles Dodgers | sports_team | 4/7, 3/5 | 0.50 | 0.42 | 0.25 | 0.58 | 0.42 |
| Real Madrid CF | sports_team | 6/6, 5/5 | 0.33 | 0.37 | 0.37 | 0.43 | 0.30 |
| FC Barcelona | sports_team | 4/5, 4/5 | 0.34 | 0.31 | 0.31 | 1.00 | 0.38 |
| McLaren Mastercard Formula 1 Team | sports_team | 8/11, 6/6 | 0.54 | 0.56 | 0.60 | 0.63 | 0.50 |
| Wrexham AFC | sports_team | 2/4, 5/5 | 0.50 | 0.60 | 0.40 | 0.80 | 0.30 |
