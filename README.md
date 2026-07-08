# MacroChef

Enter your target macros for a meal and a dish you're craving. **No API keys needed** — the app uses free public services:

1. Finds a real recipe from [TheMealDB](https://www.themealdb.com/) (free recipe database)
2. Applies macro-friendly ingredient swaps from a built-in rules engine (Greek yogurt for sour cream, lean turkey for ground beef, chickpea pasta for white pasta, etc.)
3. Estimates the total macros per serving of the modified recipe from a bundled nutrition table
4. Finds real supermarkets near your location via OpenStreetMap (Nominatim + Overpass)

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — no keys, no accounts.

## How it works

- **Frontend**: Next.js App Router page ([app/page.tsx](app/page.tsx)) with a form for macros, dish, and location.
- **Backend**: One API route ([app/api/plan/route.ts](app/api/plan/route.ts)) that queries TheMealDB for the recipe and OpenStreetMap for nearby supermarkets in parallel, applies swap rules, and estimates macros.
- **Nutrition engine**: [lib/nutrition.ts](lib/nutrition.ts) — per-100g nutrition table (~100 common ingredients), measure parser ("1 lb", "2 tbsp", "300ml" → grams), and the swap rules.

## Notes & limitations

- Macro numbers are rough estimates from a static nutrition table, not verified nutrition facts. Serving count is assumed (TheMealDB doesn't publish it).
- Recipe selection is limited to TheMealDB's catalog — use common dish names ("carbonara", "beef tacos", "pad thai").
- Store results come from OpenStreetMap data, not live inventory.
- Nominatim and Overpass are free community services with rate limits — fine for personal use, not for high-traffic deployment.
