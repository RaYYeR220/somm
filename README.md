# Somm

**The sponsorship sommelier.** Somm reads [Qloo](https://qloo.com)'s cultural taste graph to find the brands a podcast, tour, festival or team's fans already love, says no to the deals it can't prove, and shows the receipt for every number.

- **Rights holders** get a fan fingerprint, a scored sponsor board, claim-checked pitches and a media kit they can send.
- **Brands** paste the sponsorship offers they received and get a verdict per offer: pursue, consider, pass or blocked.
- **Agents** call the same judgment over MCP.

Live: **https://somm-494617981995.us-central1.run.app** — no sign-in; example reports load instantly.

## Why it needs Qloo

A language model asked "who should sponsor this podcast?" answers from general knowledge and names the same handful of famous brands for everything. Qloo knows what a specific audience over-indexes for across music, film, TV, podcasts, places and brands, where those fans live, and whether the audience is growing. Somm turns that into a decision a partnerships lead can defend: every figure in a report links to the exact Qloo request that produced it. Each report also shows the model-only answer next to Somm's, so the difference is visible.

## How it works

```
 Browser ──SSE──▶  Next.js app (one container)
                    │
                    ├─ Agent runs (Scout, Diligence)
                    │    resolve ▶ fingerprint ▶ plan ▶ prospect ▶ score ▶ gates ▶ pitch ▶ claim check
                    │
                    ├─ Qloo access
                    │    qloo mcp (official harness, stdio): recommend, rank, demographics, heatmap, trends, tags
                    │    Qloo API (direct): search, tag lookup, multi-brand Insights
                    │    every call ▶ Evidence Ledger (request, status, answer hash) + private cache
                    │
                    ├─ Language model: plans categories, reads offers, writes pitches. Never produces a score.
                    ├─ Public MCP server at /mcp
                    └─ SQLite (replicated to Cloud Storage with Litestream)
```

**Fit Score (0–100), computed in code.** Five Qloo signals, weighted and re-normalised over whatever is available:

| Signal | Weight | Qloo source |
| --- | --- | --- |
| Fan affinity: the brand's rank among the category's brands for this audience | 35% | Insights, `filter.type=urn:entity:brand` with the property's entities as signals |
| Love back: do the brand's fans like the property? | 20% | Insights rank workflow, the brand as the signal |
| Who they are: age and gender lean similarity | 20% | Insights `urn:demographics` for both |
| Where they are: overlap of the strongest areas | 15% | Insights `urn:heatmap` for both |
| Momentum: popularity trend over the past year | 10% | Trending |

With fewer than three signals Somm shows no number at all.

**Gates, enforced in code, failing closed.**

- *Exclusivity:* a brand in a category another partner holds exclusively is blocked.
- *Competitors (brand side):* an offer from a property that already works with a competitor you named is blocked.
- *Age-restricted categories (beer, spirits, sports betting):* industry codes require 73.6% (Beer Institute, Brewers Association, AGA) or 73.8% (DISCUS) of the audience to be 21+. Qloo measures taste affinity, not audience shares, so Somm never clears these deals on taste data alone. Strong youth skew or an all-ages event blocks them; otherwise they're capped at "consider" until measured audience data is in.
- *Untrusted offers:* text in a pasted offer that tries to instruct an AI reviewer is detected, stripped before the model reads it, and shown to the user.

**Claim check.** Pitches are written only from ledger-backed facts and must cite them. A sentence with a number, ranking or named entity that doesn't match a cited fact is struck out. Exports contain only kept text, with numbered sources.

## Proof

- `eval/`: a pre-registered test on 202 real, sourced sponsorships across 24 properties. Do brands that actually signed score above same-category brands that didn't? The method and the answer-key hash were committed before the first run. Results and the honest gaps are in [EVAL.md](EVAL.md) and on the site's Proof page.
- `tests/`: unit and integration tests for the gateway, ledger, scoring, gates, claim checker, orchestrator, API and MCP server.

## Run it

Requires Node 22.19 or newer, a Qloo hackathon API key and a chat-completions API endpoint.

```sh
npm install
cp .env.example .env.local   # fill in QLOO_API_KEY and LLM_* values
npm run dev                  # http://localhost:3000
npm test                     # unit and integration tests
npx tsx --env-file=.env.local scripts/seed.mts   # build the example reports
npx tsx --env-file=.env.local eval/run.mts       # run the sponsorship eval
```

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Qloo hackathon key |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Any chat-completions API endpoint |
| `DATA_DIR` | Where the SQLite database lives |
| `PUBLIC_URL` | Used in media-kit and MCP links |
| `QLOO_RUN_BUDGET` | Maximum Qloo calls per run (default 140) |

Deploy: `deploy/deploy.sh` builds the container with Cloud Build and runs one always-on Cloud Run instance, with Litestream replicating the database to Cloud Storage.

## Honest limits

- Qloo describes aggregate audience affinity. Somm makes no claim about any individual and sends Qloo no personal data.
- Fit is not the same as who pays. Budgets, agencies and timing decide deals too.
- Entity matching uses Qloo search. Ambiguous names pause the run and ask, or, for offers, take the closest match and say so.
- Offer prices are taken as given; Somm doesn't judge whether a price is fair.
- Media-kit owner links are bearer links: anyone with the link can read and update that kit's inbox.

## License

MIT
