# Sponsor-fit eval — pre-registered

Registered before the first live run. The answer key and traps are hashed below; the runner refuses to run if either file changes.

- `eval/ground-truth.json` sha256 `f693dc766dbbe53b77fd501eff9010558eca46abe700a8ec17382d15a093e69f`
- `eval/traps.json` sha256 `4f75331578d016a4d5aa85b86088228f9f21e08970267d9e277e53318cf196a0`

## Question

When a brand really did sponsor a property (revealed preference, from public sources), does Somm's Fit Score rank it above same-category brands that did not?

## Data

24 properties (9 podcasts, 8 festivals, 7 teams) with 202 sourced sponsors and 122 same-category controls. Sources and caveats: `eval/ground-truth.json` and its `conventions` block. A control "absent in sources" is not proof that no deal ever existed; podcast controls are the weakest (dynamic ad insertion).

## Method

For each property: resolve its entities and the candidate brands in Qloo (closest-name match, noted). Brands Qloo can't find are dropped and counted. Then score every remaining candidate with:

1. **Somm Fit Score** — the production scorer (`scoreFit`), with the affinity component taken from one Qloo Insights call ranking all candidates against the property's signals.
2. **Affinity only** — that single Qloo affinity, no other component.
3. **Popularity only** — Qloo's popularity percentile for the brand, ignoring the property. Popular brands sponsor many properties, so this is the baseline to beat.
4. **Model only** — the same language model Somm uses, asked to rank the same candidates with no Qloo data.
5. **Negative control** — the affinity component computed against a different property's signals (next property in file order). If this scores like method 2, the affinity signal is not property-specific.

Metric: per-property AUC (sponsors vs controls, ties 0.5), averaged across properties. Also reported: per-type means and how many properties each method wins.

## What would count as success

- Somm and affinity-only beat popularity-only and the negative control on mean AUC.
- Every gate trap in `eval/traps.json` produces its expected outcome (100%).

## Known limits, stated in advance

- The model-only baseline may recall real sponsorships from its training data (famous properties, press releases). A high score there is memory, not audience reasoning; it is reported, not excluded.
- Fit is not the same as who pays: budgets, agencies and timing decide deals too. AUC near 0.5 on a property is a possible honest outcome.
- Results publish aggregate metrics only. Per-brand Qloo values stay out of the repository (Qloo API terms).

## Amendment, before the first run (2026-10-28)

The KATSEYE gate traps named the group as a Qloo artist, but the hackathon dataset has no artist entity for KATSEYE; its fandom is only present through the series *Pop Star Academy: KATSEYE*. The two KATSEYE traps now use that series as the audience proxy. Nothing else changed. The previous hash of `eval/traps.json` was `875c4f39ed31996921ae6631298d97a1ffb4c78d2b307a099a34335c3850b0d8`.

## Deviation, after run 1 (2026-10-28)

Run 1 showed affinity against the wrong property scoring like affinity against the right one (negative control 0.52 vs affinity 0.48). Two causes were found: a market location signal that outweighed each audience's own signal, and brand-name matching that accepted unrelated search hits. Both were removed from the product and the eval before run 2: no location signal, and a brand name only stands in for another when every word matches. Every method is now also compared on the same set of brands. This is a post-hoc change; run 1's results remain in the repository history and in EVAL.md.
