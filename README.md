# MacroChef

Recipes that fit your macros. **No API keys needed** — the app uses free public services.

Three modes:

### Adapt a recipe you found

Paste a recipe URL — or the ingredient list itself — plus your macro targets.
MacroChef estimates every ingredient, then **rewrites the recipe toward your
numbers**, swapping only the ingredients that actually help, and tells you what
portion to eat.

Swaps are chosen, not assumed. Each candidate is scored against *your* target and
kept only if it improves the fit, so cutting fat and targeting fat produce
different recipes from the same page. A keto target on a carbonara swaps the pasta
and leaves the bacon alone.

Every swap shows its arithmetic — what it did to the plate, and how far it moved
the fit — and any of them can be turned down, which sends the search looking for
the next best thing. Substitutions that were *considered and rejected* are listed
too, so a missing swap reads as a decision rather than an oversight.

### Find a meal

Name a dish instead, and MacroChef finds a real recipe from
[TheMealDB](https://www.themealdb.com/), applies the same swap search, prices the
ingredients, and maps them to supermarkets near you via OpenStreetMap.

### Plan a day

Name a few dishes and a *daily* target. Portions are solved across every meal at
once rather than one at a time, so a carb-heavy breakfast can be paid for by a
leaner dinner — two recipes with complementary ratios can land a day on target
when neither fits alone. The shopping list is merged into one trip, so ingredients
shared between meals become a single line.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — no keys, no accounts.

### Optional: your own USDA key

Ingredients outside the built-in table are looked up in USDA FoodData Central via
their shared `DEMO_KEY`, which is rate-limited per IP. For a personal key (free
and instant, from [the signup page](https://fdc.nal.usda.gov/api-key-signup)):

```bash
echo "USDA_API_KEY=your-key-here" >> .env.local
```

Without it the app still works — unmatched ingredients just show as "no data" more
often, and you can identify them by hand.

## How it works

### Frontend

- **Page** ([app/page.tsx](app/page.tsx)) — mode tabs, macro targets, and results.
- **Widgets** ([app/widgets.tsx](app/widgets.tsx)) — macro ring, fit bars, daily log, theme toggle.
- **Panels** ([app/panels.tsx](app/panels.tsx)) — the interactive parts: the ingredient
  editor, the swap explanations, the target calculator, the saved-recipe kitchen,
  and the shopping list.

### Routes

- **`/api/analyze`** ([route](app/api/analyze/route.ts)) — fetches a page and pulls the
  recipe out of its JSON-LD markup. When a page can't be read, the response says so
  and points at the paste box.
- **`/api/adapt`** ([route](app/api/adapt/route.ts)) — adapts ingredient lines the caller
  already holds. One endpoint behind three things that look unrelated on the page:
  a pasted list, a hand-corrected ingredient table, and a vetoed swap.
- **`/api/plan`** ([route](app/api/plan/route.ts)) — searches TheMealDB and OpenStreetMap
  in parallel, then adapts and prices the result.
- **`/api/day`** ([route](app/api/day/route.ts)) — several dishes against one daily target.

### Engine

- **Shared pipeline** ([lib/recipe.ts](lib/recipe.ts)) — everything between "here are
  some ingredient lines" and "here is an adapted, priced, portioned recipe". All four
  routes converge here, so a fix in one mode can't miss the other three.
- **Adaptation** ([lib/adapt.ts](lib/adapt.ts)) — ingredient parsing, hand-edit overrides,
  and the greedy swap search.
- **Swap candidates** ([lib/swaps.ts](lib/swaps.ts)) — proposals from two sources: 17
  hand-written rules with editorial reasons, and the food-family table, which lets any
  listed ingredient be traded for another member of its culinary family with a reason
  generated from the macro difference. Neither source decides anything; both only
  propose, and `lib/adapt.ts` scores every proposal against the user's target.
- **Fitting math** ([lib/fit.ts](lib/fit.ts)) — `bestFitPortion` solves for the portion
  minimizing summed squared relative error across all four macros; `fitError` scores
  what's left after optimal portioning, which is the ratio mismatch a swap can
  actually change; `fitPortions` solves a whole day's portions jointly.
- **Nutrition data** ([lib/nutrition.ts](lib/nutrition.ts)) — per-100g table (~128
  ingredients), the measure parser ("1 lb", "2 tbsp", "300ml" → grams), the swap rules,
  and the food families.
- **External lookups** ([lib/usda.ts](lib/usda.ts)) — USDA FoodData Central, for the long
  tail the built-in table doesn't carry. The curated table always wins.
- **Shopping** ([lib/shopping.ts](lib/shopping.ts)) — merging several recipes into one
  trip, consolidating on the food each line resolved to rather than on its text.
- **Targets** ([lib/tdee.ts](lib/tdee.ts)) — Mifflin-St Jeor, activity multipliers, goal
  adjustments, and macro-split presets with a protein floor.

## Tests

```bash
npm test
```

127 tests over the pure logic — the fitting math, the swap search, the measure
parser, the nutrition table's own consistency, shopping consolidation, and the
target calculator. No test framework to install: Node runs the TypeScript directly
(a [small resolver hook](tests/resolve-ts.mjs) bridges Node's need for file
extensions to the app's extensionless imports).

## Notes & limitations

- Macro numbers are estimates from a nutrition table, not verified nutrition facts.
  Every line is editable — if the parser misreads an ingredient or its weight, fix it
  and everything downstream is recalculated.
- Adapting a link needs the page to publish standard schema.org recipe markup. Major
  recipe sites do; personal blogs often don't. Paste the ingredients instead — that
  path has no such requirement.
- Where a site doesn't publish a serving count, the portion is expressed as a share
  of the whole recipe.
- Swaps come from the rule list and the food-family table, so an ingredient in neither
  gets portion advice and nothing else. Aromatics, stocks and spices are deliberately
  unswappable.
- Recipe *search* is limited to TheMealDB's catalog — use common dish names
  ("carbonara", "beef tacos", "pad thai"). TheMealDB publishes no serving counts, so
  those recipes are assumed to make 4.
- Store results come from OpenStreetMap data, not live inventory. Prices are national
  averages, not real store prices.
- Nominatim, Overpass and USDA's DEMO_KEY are free shared services with rate limits.
  Responses are cached, but this is sized for personal use, not high-traffic
  deployment.
- Saved recipes, daily logs and body stats live in your browser's localStorage. No
  accounts, and nothing leaves your machine except the recipe lookups themselves.
- The target calculator estimates for a healthy adult sizing a meal. It is not
  medical or nutritional advice.
