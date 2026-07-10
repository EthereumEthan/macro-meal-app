"use client";

import { useEffect, useState } from "react";
import { Macros } from "@/lib/nutrition";
import {
  AddToDayButton,
  DailyBar,
  FitBars,
  GroceryList,
  MacroRing,
  useDailyLog,
} from "@/app/widgets";

interface Plan {
  recipeName: string;
  imageUrl: string | null;
  sourceUrl: string;
  servings: number;
  originalMacros: Macros;
  swaps: { original: string; replacement: string; reason: string }[];
  ingredients: {
    text: string;
    price: number | null;
    macros: Macros | null;
  }[];
  instructions: string[];
  modifiedMacros: Macros;
  fitMultiplier: number;
  fittedMacros: Macros;
  fittedCost: number | null;
  recipeCost: number | null;
  costPerServing: number | null;
  stores: {
    name: string;
    area: string;
    carries: string;
    estCost: number | null;
  }[];
  notes: string;
}

function MacroPills({ macros, dim }: { macros: Macros; dim?: boolean }) {
  return (
    <div className="macro-row">
      <div className={`macro-pill${dim ? " orig" : ""}`}>
        <div className="value">{Math.round(macros.calories)}</div>
        <div className="label">cals</div>
      </div>
      <div className={`macro-pill${dim ? " orig" : ""}`}>
        <div className="value">{Math.round(macros.protein)}g</div>
        <div className="label">protein</div>
      </div>
      <div className={`macro-pill${dim ? " orig" : ""}`}>
        <div className="value">{Math.round(macros.carbs)}g</div>
        <div className="label">carbs</div>
      </div>
      <div className={`macro-pill${dim ? " orig" : ""}`}>
        <div className="value">{Math.round(macros.fat)}g</div>
        <div className="label">fat</div>
      </div>
    </div>
  );
}

function describePortion(k: number): string {
  if (k >= 0.9 && k <= 1.1) return "about 1 serving";
  const rounded = Math.round(k * 10) / 10;
  if (rounded < 0.1) return "less than a tenth of a serving";
  return `about ${rounded} serving${rounded === 1 ? "" : "s"}`;
}

interface Analysis {
  title: string;
  imageUrl: string | null;
  sourceUrl: string;
  servings: number | null;
  ingredients: {
    text: string;
    skipped: boolean;
    grams: number | null;
    macros: Macros | null;
  }[];
  totals: Macros;
  perServing: Macros | null;
  siteNutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  } | null;
  notes: string;
}

type GeoStatus = "detecting" | "ok" | "unavailable";
type Mode = "find" | "link";

export default function Home() {
  const [meal, setMeal] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("detecting");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoStatus("ok");
      },
      () => setGeoStatus("unavailable"),
      { timeout: 10000, maximumAge: 300000 },
    );
  }, []);
  const [calories, setCalories] = useState("600");
  const [protein, setProtein] = useState("45");
  const [carbs, setCarbs] = useState("50");
  const [fat, setFat] = useState("20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<Mode>("find");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [submittedTarget, setSubmittedTarget] = useState<Macros | null>(null);
  const dailyLog = useDailyLog();

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: recipeUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setAnalysis(data.analysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setPlan(null);
    setRaw(null);
    setAnalysis(null);
  }

  async function copyMacros() {
    if (!plan) return;
    const m = plan.modifiedMacros;
    const text = `${plan.recipeName} (macro-adjusted) — 1 serving: ${Math.round(m.calories)} cals, ${Math.round(m.protein)}g protein, ${Math.round(m.carbs)}g carbs, ${Math.round(m.fat)}g fat`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked; fall back to a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPlan(null);
    setRaw(null);

    const target: Macros = {
      calories: Number(calories),
      protein: Number(protein),
      carbs: Number(carbs),
      fat: Number(fat),
    };
    setSubmittedTarget(target);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal,
          ...(coords ? { coords } : { location }),
          macros: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else if (data.plan) {
        setPlan(data.plan);
      } else if (data.raw) {
        setRaw(data.raw);
      } else {
        setError("Unexpected response from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            🥗 Macro<span className="grad-text">Chef</span>
          </div>
          <div className="tabs">
            <button
              type="button"
              className={mode === "find" ? "tab active" : "tab"}
              onClick={() => switchMode("find")}
            >
              Find a meal
            </button>
            <button
              type="button"
              className={mode === "link" ? "tab active" : "tab"}
              onClick={() => switchMode("link")}
            >
              Analyze a link
            </button>
          </div>
        </div>
      </header>
      <main>
      <div className="hero">
        <h1>
          Eat what you crave.
          <br />
          <span className="grad-text">Hit your macros.</span>
        </h1>
        <p className="tagline">
          Real recipes adapted to your targets — portion-sized, priced, and
          mapped to grocery stores near you.
        </p>
      </div>

      <DailyBar log={dailyLog} />

      {mode === "link" && (
        <form className="card" onSubmit={submitLink}>
          <h2>Paste a recipe link</h2>
          <div className="grid">
            <div className="full-row">
              <label htmlFor="recipeUrl">Recipe URL</label>
              <input
                id="recipeUrl"
                type="url"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
                placeholder="e.g. https://www.allrecipes.com/recipe/..."
                required
              />
            </div>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Reading the recipe…" : "Get nutrition facts"}
          </button>
        </form>
      )}

      {mode === "find" && (
      <form className="card" onSubmit={submit}>
        <h2>What do you want to eat?</h2>
        <div className="grid">
          <div className="full-row">
            <label htmlFor="meal">Meal or dish</label>
            <input
              id="meal"
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              placeholder="e.g. chicken alfredo, beef tacos, pad thai"
              required
            />
          </div>
          <div className="full-row">
            {geoStatus === "ok" ? (
              <p className="geo-status ok">
                📍 Using your current location for nearby stores
              </p>
            ) : geoStatus === "detecting" ? (
              <p className="geo-status">📍 Detecting your location…</p>
            ) : (
              <>
                <label htmlFor="location">
                  Your location (couldn&apos;t detect it automatically — enter
                  city, state or zip)
                </label>
                <input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Austin, TX or 78701"
                  required
                />
              </>
            )}
          </div>
          <div>
            <label htmlFor="calories">Calories (cals)</label>
            <input
              id="calories"
              type="number"
              min="0"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="protein">Protein (g)</label>
            <input
              id="protein"
              type="number"
              min="0"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="carbs">Carbs (g)</label>
            <input
              id="carbs"
              type="number"
              min="0"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="fat">Fat (g)</label>
            <input
              id="fat"
              type="number"
              min="0"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Searching recipes & crunching macros…" : "Build my meal"}
        </button>
      </form>
      )}

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="card loading">
          <div className="spinner" />
          {mode === "find"
            ? "Finding a recipe online, swapping ingredients to fit your macros, and checking stores near you. This can take a minute or two."
            : "Fetching the recipe page and estimating nutrition for each ingredient…"}
        </div>
      )}

      {raw && (
        <div className="card">
          <h2>Result</h2>
          <pre className="raw">{raw}</pre>
        </div>
      )}

      {plan && (
        <>
          <div className="results-top">
          <div className="card">
            {plan.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="meal-photo"
                src={plan.imageUrl}
                alt={plan.recipeName}
              />
            )}
            <h2>{plan.recipeName}</h2>
            <p className="source">
              Based on:{" "}
              <a href={plan.sourceUrl} target="_blank" rel="noreferrer">
                {plan.sourceUrl}
              </a>{" "}
              · {plan.servings} serving{plan.servings === 1 ? "" : "s"}
            </p>
            {plan.notes && <p className="notes">{plan.notes}</p>}
          </div>

          <div className="card">
            <h2>
              <span className="icon">🎯</span>
              Your portion, sized to your macros
            </h2>
            <div className="portion-rec">
              🍽️ Eat <strong>{describePortion(plan.fitMultiplier)}</strong> to
              best match your targets
              {plan.fittedCost !== null && (
                <span className="portion-cost">
                  {" "}
                  · ~${plan.fittedCost.toFixed(2)} of ingredients
                </span>
              )}
            </div>
            <MacroRing macros={plan.fittedMacros} />
            {submittedTarget && (
              <FitBars target={submittedTarget} actual={plan.fittedMacros} />
            )}
            <div className="orig-compare">
              <label>One full serving (of {plan.servings}), after swaps:</label>
              <MacroPills macros={plan.modifiedMacros} dim />
            </div>
            <AddToDayButton
              name={`${plan.recipeName} (${describePortion(plan.fitMultiplier)})`}
              macros={plan.fittedMacros}
              onAdd={dailyLog.addMeal}
            />
          </div>
          </div>

          {plan.swaps.length > 0 && (
            <div className="card">
              <h2>
                <span className="icon">🔄</span>
                Ingredient swaps
              </h2>
              {plan.swaps.map((s, i) => (
                <div className="swap" key={i}>
                  <span className="from">{s.original}</span>
                  <span className="arrow">→</span>
                  <span>{s.replacement}</span>
                  <span className="why">{s.reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2>
              <span className="icon">🧾</span>
              Ingredients
              {plan.recipeCost !== null && (
                <span className="cost-badge">
                  est. ${plan.recipeCost.toFixed(2)} total
                  {plan.costPerServing !== null &&
                    ` · $${plan.costPerServing.toFixed(2)}/serving`}
                </span>
              )}
            </h2>
            <ul className="plain">
              {plan.ingredients.map((ing, i) => (
                <li key={i} className="ing-row">
                  <span>{ing.text}</span>
                  <span className="ing-side">
                    {ing.macros && (
                      <span className="nutri-facts">
                        {Math.round(ing.macros.calories)} cals ·{" "}
                        {Math.round(ing.macros.protein)}P ·{" "}
                        {Math.round(ing.macros.carbs)}C ·{" "}
                        {Math.round(ing.macros.fat)}F
                      </span>
                    )}
                    {ing.price !== null && (
                      <span className="ing-price">~${ing.price.toFixed(2)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>
              <span className="icon">🛒</span>
              Shopping list by aisle
            </h2>
            <p className="log-help">
              Grouped the way a store is laid out — check items off as you go.
            </p>
            <GroceryList ingredients={plan.ingredients} />
          </div>

          <div className="card">
            <h2>
              <span className="icon">👨‍🍳</span>
              Instructions
            </h2>
            <ol className="plain">
              {plan.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h2>
              <span className="icon">📍</span>
              Where to buy near you
            </h2>
            {plan.stores.map((s, i) => (
              <div className="store" key={i}>
                <span className="name">{s.name}</span>
                <span className="area">{s.area}</span>
                {s.estCost !== null && (
                  <span className="store-cost">
                    est. ${s.estCost.toFixed(2)} for all ingredients
                  </span>
                )}
                <div className="carries">{s.carries}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>
              <span className="icon">📒</span>
              Log this meal in your food diary
            </h2>
            <p className="log-help">
              MyFitnessPal and MyNetDiary don&apos;t allow outside apps to add
              food automatically, but both have a <strong>Quick Add</strong>{" "}
              feature. Copy the numbers below and paste them in — takes about
              10 seconds.
            </p>
            <div className="log-values">
              <div className="log-row">
                <span className="log-label">Calories</span>
                <span className="log-num">
                  {Math.round(plan.modifiedMacros.calories)}
                </span>
              </div>
              <div className="log-row">
                <span className="log-label">Protein</span>
                <span className="log-num">
                  {Math.round(plan.modifiedMacros.protein)} g
                </span>
              </div>
              <div className="log-row">
                <span className="log-label">Carbs</span>
                <span className="log-num">
                  {Math.round(plan.modifiedMacros.carbs)} g
                </span>
              </div>
              <div className="log-row">
                <span className="log-label">Fat</span>
                <span className="log-num">
                  {Math.round(plan.modifiedMacros.fat)} g
                </span>
              </div>
            </div>
            <button type="button" className="copy-btn" onClick={copyMacros}>
              {copied ? "Copied ✓" : "Copy meal + macros to clipboard"}
            </button>
            <p className="log-help small">
              MyFitnessPal: Diary → Add Food → Quick Add. MyNetDiary: Dashboard
              → + → Quick add calories. Paste the copied text into the notes so
              you remember what it was.
            </p>
          </div>
        </>
      )}

      {analysis && (
        <>
          <div className="card">
            {analysis.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="meal-photo"
                src={analysis.imageUrl}
                alt={analysis.title}
              />
            )}
            <h2>{analysis.title}</h2>
            <p className="source">
              From:{" "}
              <a href={analysis.sourceUrl} target="_blank" rel="noreferrer">
                {analysis.sourceUrl}
              </a>
              {analysis.servings !== null &&
                ` · ${analysis.servings} serving${analysis.servings === 1 ? "" : "s"}`}
            </p>
            <p className="notes">{analysis.notes}</p>
          </div>

          <div className="card">
            <h2>
              <span className="icon">🧾</span>
              Ingredients &amp; nutrition facts
            </h2>
            <div className="nutri-list">
              {analysis.ingredients.map((ing, i) => (
                <div
                  className={ing.skipped ? "nutri-row skipped" : "nutri-row"}
                  key={i}
                >
                  <span className="nutri-name">{ing.text}</span>
                  {ing.skipped ? (
                    <span className="nutri-facts muted">
                      seasoning — not counted
                    </span>
                  ) : ing.macros ? (
                    <span className="nutri-facts">
                      {Math.round(ing.macros.calories)} cals ·{" "}
                      {Math.round(ing.macros.protein)}P ·{" "}
                      {Math.round(ing.macros.carbs)}C ·{" "}
                      {Math.round(ing.macros.fat)}F
                    </span>
                  ) : (
                    <span className="nutri-facts muted">no data</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>
              <span className="icon">🎯</span>
              {analysis.perServing
                ? "Nutrition per serving (estimated)"
                : "Whole recipe (estimated)"}
            </h2>
            <MacroRing macros={analysis.perServing ?? analysis.totals} />
            {analysis.perServing && (
              <div className="orig-compare">
                <label>Whole recipe ({analysis.servings} servings):</label>
                <MacroPills macros={analysis.totals} dim />
              </div>
            )}
            <AddToDayButton
              name={analysis.title}
              macros={analysis.perServing ?? analysis.totals}
              onAdd={dailyLog.addMeal}
            />
            {analysis.siteNutrition && (
              <p className="notes">
                The recipe site reports per serving:{" "}
                {analysis.siteNutrition.calories !== null &&
                  `${Math.round(analysis.siteNutrition.calories)} cals`}
                {analysis.siteNutrition.protein !== null &&
                  `, ${Math.round(analysis.siteNutrition.protein)}g protein`}
                {analysis.siteNutrition.carbs !== null &&
                  `, ${Math.round(analysis.siteNutrition.carbs)}g carbs`}
                {analysis.siteNutrition.fat !== null &&
                  `, ${Math.round(analysis.siteNutrition.fat)}g fat`}
                {" "}— a good cross-check against the estimates above.
              </p>
            )}
          </div>
        </>
      )}
      </main>
    </>
  );
}
