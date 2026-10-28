# What the eval found

**Short version:** on 24 well-known properties, the brands that actually sponsor them are no better matched to their fans, by Qloo's taste data, than same-category brands that don't. Somm's Fit Score separates real sponsors from those controls at chance level (mean AUC 0.49). So does Qloo affinity on its own (0.49). A language model with no taste data does better (0.64), most visibly on deals that were widely announced. Somm does not predict who already signed, and we don't claim it does.

What Somm claims is narrower and checkable: which brands a property's fans over-index for, with the Qloo request behind every number. The eval says that today's sponsorship money mostly isn't following that signal, which is the gap Somm is built for.

## The test

Pre-registered in [eval/spec.md](eval/spec.md) before the first run: 24 properties (9 podcasts, 8 festivals, 7 teams), 202 real sponsorships with public sources, 122 same-category brands that didn't sponsor in the sources we checked. For each property: does a method score real sponsors above the controls? AUC 0.5 is a coin flip.

## Results (run 2)

| Method | Mean AUC | Podcasts | Festivals | Teams | Properties won |
| --- | --- | --- | --- | --- | --- |
| Somm Fit Score | 0.49 | 0.51 | 0.52 | 0.42 | 1 |
| Qloo affinity only | 0.49 | 0.49 | 0.55 | 0.42 | 1 |
| Popularity only | 0.43 | 0.44 | 0.45 | 0.41 | 1 |
| Model only (no Qloo) | 0.64 | 0.59 | 0.68 | 0.68 | 18 |
| Negative control | 0.48 | 0.55 | 0.50 | 0.38 | 3 |

Per-property numbers and the gate traps: [eval/RESULTS.md](eval/RESULTS.md).

**Exploratory, not pre-registered:** we also asked whether a real sponsor's affinity is higher with its own property's fans than with another property's fans. It was in 91 of 168 cases (54%), against 58 of 111 (52%) for the controls. That difference is noise (z = 0.31).

## Reading it honestly

- **The model-only baseline is a memory test.** It scores 1.00 on FC Barcelona (Spotify, Nike) and 0.95 on Lex Fridman, whose sponsors are widely published. It scores 0.00 on This Week in Startups. It is predicting the status quo, not audience fit.
- **Popularity alone is below chance (0.43).** The most famous brands in a category are not the ones that sponsored these properties more often.
- **Fit is not the same as who pays.** Budgets, agencies, timing and category deals decide sponsorships. A property's existing sponsors are not ground truth for who fits its audience.
- **Controls are weak evidence.** A control brand missing from the sources we checked is not proof that it never sponsored the property. Podcast ads are inserted per listener, so podcast controls are the weakest.

## Gate traps: 10 of 11 caught

Every age-restricted and exclusivity trap produced the expected verdict, apart from one. That trap (Dodgers × Polymarket) could not run because Polymarket is not in the Qloo hackathon dataset. The two KATSEYE traps were blocked because Qloo has no audience-age data for that audience, and Somm refuses to clear beer or betting deals blind.

## How we got here: run 1, and the change after it

Run 1 used a version of Somm that added the property's market ("United States") as a location signal to every Qloo request, and that accepted the closest search hit when a brand name had no exact match. Its results were somm 0.48, affinity 0.48, popularity 0.45, model only 0.62, negative control 0.52.

The negative control flagged the problem: affinity computed against the wrong property's fans scored as well as affinity against the right one. Checking directly, the location signal dominated Qloo's answer. Every audience got nearly the same brand order, and brands without location data dropped out. Separately, loose name matching had turned "David Protein" into a gallery and "Tito's" into a different vodka.

We removed the location signal from the product and the eval, and required every word of a brand name to match, then ran it again (run 2, above). This change was made after seeing run 1, so it is a deviation from the registration. The run 1 results are kept in the repository history. Neither run supports the claim that audience fit predicts existing sponsorships.
