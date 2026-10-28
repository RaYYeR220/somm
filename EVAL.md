# Eval results

Run 2026-10-28T08:26:41.682Z. Method and success criteria were registered in advance in [eval/spec.md](eval/spec.md).

| Method | Mean AUC | Podcasts | Festivals | Teams | Properties won |
| --- | --- | --- | --- | --- | --- |
| Somm Fit Score | 0.48 | 0.47 | 0.52 | 0.42 | 1 |
| Qloo affinity only | 0.48 | 0.38 | 0.56 | 0.52 | 2 |
| Popularity only | 0.45 | 0.44 | 0.45 | 0.45 | 2 |
| Model only (no Qloo) | 0.62 | 0.58 | 0.69 | 0.60 | 16 |
| Negative control | 0.52 | 0.50 | 0.55 | 0.52 | 5 |

Gate traps: **10/11** produced the expected outcome.

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
| Huberman Lab | podcast | 9/10 · 5/5 | 0.21 | 0.19 | 0.33 | 0.87 | 0.24 |
| Lex Fridman Podcast | podcast | 7/9 · 5/5 | 0.54 | 0.46 | 0.54 | 0.80 | 0.54 |
| The Tim Ferriss Show | podcast | 6/8 · 4/5 | 0.17 | 0.17 | 0.21 | 0.88 | 0.75 |
| The Joe Rogan Experience | podcast | 7/8 · 5/5 | 0.50 | 0.54 | 0.29 | 0.57 | 0.54 |
| The Bill Simmons Podcast | podcast | 6/6 · 5/5 | 0.55 | 0.50 | 0.73 | 0.43 | 0.60 |
| Pardon My Take | podcast | 8/8 · 5/5 | 0.42 | 0.38 | 0.42 | 0.47 | 0.63 |
| Call Her Daddy | podcast | 8/8 · 5/5 | 0.34 | 0.17 | 0.57 | 0.50 | 0.29 |
| Armchair Expert with Dax Shepard | podcast | 6/6 · 5/5 | 0.47 | 0.67 | 0.37 | 0.73 | 0.42 |
| This Week in Startups | podcast | 2/7 · 2/5 | 1.00 | – | 0.50 | 0.00 | – |
| Coachella Valley Music and Arts Festival | festival | 10/10 · 5/5 | 0.39 | 0.39 | 0.36 | 0.92 | 0.46 |
| Lollapalooza (Chicago) | festival | 11/11 · 5/5 | 0.66 | 0.50 | 0.56 | 0.78 | 0.36 |
| Austin City Limits Music Festival | festival | 11/11 · 5/5 | 0.46 | 0.47 | 0.44 | 0.73 | 0.56 |
| The Governors Ball Music Festival | festival | 12/12 · 5/5 | 0.63 | 0.60 | 0.55 | 0.67 | 0.63 |
| Bonnaroo Music & Arts Festival | festival | 10/10 · 5/5 | 0.59 | 0.75 | 0.52 | 0.78 | 0.43 |
| Stagecoach Festival | festival | 8/9 · 5/5 | 0.60 | 0.61 | 0.42 | 0.35 | 0.72 |
| Primavera Sound Barcelona | festival | 11/11 · 4/5 | 0.42 | – | 0.27 | 0.93 | – |
| Rolling Loud (Orlando) | festival | 8/8 · 5/5 | 0.41 | 0.60 | 0.50 | 0.35 | 0.70 |
| Inter Miami CF | sports_team | 10/10 · 6/6 | 0.38 | 0.19 | 0.52 | 0.62 | 0.19 |
| Golden State Warriors | sports_team | 6/7 · 5/5 | 0.27 | 0.80 | 0.47 | 0.60 | 0.80 |
| Los Angeles Dodgers | sports_team | 5/7 · 4/5 | 0.42 | 0.33 | 0.40 | 0.55 | 0.33 |
| Real Madrid CF | sports_team | 6/6 · 5/5 | 0.42 | – | 0.30 | 0.43 | – |
| FC Barcelona | sports_team | 5/5 · 4/5 | – | – | 0.30 | 0.80 | – |
| McLaren Mastercard Formula 1 Team | sports_team | 10/11 · 6/6 | 0.61 | 0.75 | 0.58 | 0.53 | 0.75 |
| Wrexham AFC | sports_team | 3/4 · 5/5 | – | – | 0.60 | 0.67 | – |
