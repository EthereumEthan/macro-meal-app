# MacroChef

Recipes that fit your macros. **No API keys needed** — the app uses free public services.

Two modes:

### Adapt a recipe you found

Paste any recipe URL plus your macro targets. MacroChef reads the page, estimates
every ingredient, then **rewrites the recipe toward your numbers** — swapping only
the ingredients that actually help — and tells you what portion to eat.

Swaps are chosen, not assumed. Each candidate is scored against *your* target and
kept only if it improves the fit, so cutting fat and targeting fat produce
different recipes from the same page. A keto target on a carbonara swaps the pasta
and leaves the bacon alone.

### Find a meal

Name a dish instead, and MacroChef finds a real recipe from
[TheMealDB](https://www.themealdb.com/), applies the same swap rules, prices the
ingredients, and maps them to supermarkets near you via OpenStreetMap.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — no keys, no accounts.

## How it works

- **Frontend**: Next.js App Router page ([app/page.tsx](app/page.tsx)) — mode tabs, macro targets, and the results column.
- **Adapt route**: [app/api/analyze/route.ts](app/api/analyze/route.ts) fetches the page, pulls the recipe out of its JSON-LD markup, and hands the ingredients to the adaptation engine.
- **Plan route**: [app/api/plan/route.ts](app/api/plan/route.ts) queries TheMealDB and OpenStreetMap in parallel, then applies swaps and prices the basket.
- **Adaptation engine**: [lib/adapt.ts](lib/adapt.ts) — ingredient-line parsing and the greedy swap search.
- **Fitting math**: [lib/fit.ts](lib/fit.ts) — `bestFitPortion` solves for the portion minimizing summed squared relative error across all four macros; `fitError` scores what's left after optimal portioning, which is the ratio mismatch a swap can actually change.
- **Nutrition data**: [lib/nutrition.ts](lib/nutrition.ts) — per-100g table (~126 ingredients), measure parser ("1 lb", "2 tbsp", "300ml" → grams), and the 17 swap rules.

## Notes & limitations

- Macro numbers are rough estimates from a static nutrition table, not verified nutrition facts.
- Adapting a link needs the page to publish standard schema.org recipe markup. Major recipe sites do; personal blogs often don't. Where a site doesn't publish a serving count, the portion is expressed as a share of the whole recipe.
- Swaps can only come from the built-in rule list, so a recipe with no matching ingredients gets portion advice and nothing else.
- Recipe *search* is limited to TheMealDB's catalog — use common dish names ("carbonara", "beef tacos", "pad thai").
- Store results come from OpenStreetMap data, not live inventory. Prices are national averages, not real store prices.
- Nominatim and Overpass are free community services with rate limits. Responses are cached, but this is sized for personal use, not high-traffic deployment.
