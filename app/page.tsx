"use client";

import { useEffect, useState } from "react";
import { Macros } from "@/lib/nutrition";
import {
  AddToDayButton,
  DailyBar,
  FitBars,
  GroceryList,
  MacroRing,
  ThemeToggle,
  useDailyLog,
} from "@/app/widgets";
import {
  AlertIcon,
  BowlIcon,
  CartIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  LeafIcon,
  LinkIcon,
  NotebookIcon,
  PinIcon,
  ReceiptIcon,
  SearchIcon,
  StepsIcon,
  SwapIcon,
  TargetIcon,
} from "@/app/icons";

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

interface AnalyzedIngredient {
  text: string;
  skipped: boolean;
  grams: number | null;
  macros: Macros | null;
}

interface Analysis {
  title: string;
  imageUrl: string | null;
  sourceUrl: string;
  servings: number | null;
  ingredients: AnalyzedIngredient[];
  totals: Macros;
  perServing: Macros | null;
  siteNutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  } | null;
  /** Present only when macro targets were sent with the request */
  adapted: {
    swaps: { original: string; replacement: string; reason: string }[];
    ingredients: AnalyzedIngredient[];
    totals: Macros;
    perServing: Macros | null;
    fitMultiplier: number;
    fittedMacros: Macros;
    basis: "serving" | "recipe";
  } | null;
  notes: string;
}

type TargetKey = "calories" | "protein" | "carbs" | "fat";

const TARGET_FIELDS: { key: TargetKey; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

function MacroTargetFields({
  values,
  onChange,
}: {
  values: Record<TargetKey, string>;
  onChange: (key: TargetKey, value: string) => void;
}) {
  return (
    <>
      {TARGET_FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={f.key}>{f.label}</label>
          <input
            id={f.key}
            type="number"
            min="0"
            value={values[f.key]}
            onChange={(e) => onChange(f.key, e.target.value)}
            required
          />
        </div>
      ))}
    </>
  );
}

type GeoStatus = "detecting" | "ok" | "unavailable";
type Mode = "find" | "link";

function SectionHead({
  icon,
  title,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="card-head">
      <span className="sec-icon">{icon}</span>
      <h2>{title}</h2>
      {aside}
    </div>
  );
}

function MacroPills({ macros, dim }: { macros: Macros; dim?: boolean }) {
  const cells: [string, string][] = [
    [`${Math.round(macros.calories)}`, "cals"],
    [`${Math.round(macros.protein)}g`, "protein"],
    [`${Math.round(macros.carbs)}g`, "carbs"],
    [`${Math.round(macros.fat)}g`, "fat"],
  ];
  return (
    <div className="macro-row">
      {cells.map(([value, label]) => (
        <div className={`macro-pill${dim ? " orig" : ""}`} key={label}>
          <div className="value">{value}</div>
          <div className="label">{label}</div>
        </div>
      ))}
    </div>
  );
}

function describePortion(
  k: number,
  basis: "serving" | "recipe" = "serving",
): string {
  // A recipe with no published yield has no "serving" to speak of, so the
  // portion is expressed as a share of the whole thing instead.
  if (basis === "recipe") return `about ${Math.round(k * 100)}% of the recipe`;
  if (k >= 0.9 && k <= 1.1) return "about 1 serving";
  const rounded = Math.round(k * 10) / 10;
  if (rounded < 0.1) return "less than a tenth of a serving";
  return `about ${rounded} serving${rounded === 1 ? "" : "s"}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceChips({
  url,
  servings,
}: {
  url: string;
  servings: number | null;
}) {
  return (
    <div className="meta-row">
      <a className="chip" href={url} target="_blank" rel="noreferrer">
        <LinkIcon />
        <span className="chip-text">{hostOf(url)}</span>
      </a>
      {servings !== null && (
        <span className="chip">
          <BowlIcon />
          {servings} serving{servings === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function ResultSkeleton({ mode }: { mode: Mode }) {
  return (
    <div className="card">
      <div className="loading-head">
        <span className="spinner" />
        <span>
          <strong>
            {mode === "find" ? "Building your meal" : "Reading the recipe"}
          </strong>
          <p>
            {mode === "find"
              ? "Finding a recipe, swapping ingredients to fit your macros, and checking stores near you. This can take a minute or two."
              : "Reading the page, estimating each ingredient, and testing swaps against your targets…"}
          </p>
        </span>
      </div>
      <div className="skel-row">
        <div className="skel skel-circle" />
        <div className="skel-lines">
          <div className="skel skel-line" style={{ width: "70%" }} />
          <div className="skel skel-line" style={{ width: "90%" }} />
          <div className="skel skel-line" style={{ width: "55%" }} />
        </div>
      </div>
      <div className="skel skel-line" style={{ width: "100%" }} />
    </div>
  );
}

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

  const [targets, setTargets] = useState<Record<TargetKey, string>>({
    calories: "600",
    protein: "45",
    carbs: "50",
    fat: "20",
  });
  const setTarget = (key: TargetKey, value: string) =>
    setTargets((t) => ({ ...t, [key]: value }));
  const targetMacros = (): Macros => ({
    calories: Number(targets.calories),
    protein: Number(targets.protein),
    carbs: Number(targets.carbs),
    fat: Number(targets.fat),
  });
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

    const target = targetMacros();
    setSubmittedTarget(target);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: recipeUrl, macros: target }),
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

    const target = targetMacros();
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

  const idle = !loading && !error && !plan && !raw && !analysis;

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            <span className="brand-mark">
              <LeafIcon />
            </span>
            MacroChef
          </div>
          <div className="tabs" role="tablist" aria-label="Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "find"}
              className={mode === "find" ? "tab active" : "tab"}
              onClick={() => switchMode("find")}
            >
              <SearchIcon />
              Find a meal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "link"}
              className={mode === "link" ? "tab active" : "tab"}
              onClick={() => switchMode("link")}
            >
              <LinkIcon />
              Analyze a link
            </button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <div className="hero">
          <h1>
            Eat what you crave.{" "}
            <span className="accent-text">Hit your macros.</span>
          </h1>
          <p className="tagline">
            Real recipes adapted to your targets — portion-sized, priced, and
            mapped to grocery stores near you.
          </p>
        </div>

        <div className="layout">
          <aside className="side">
            {mode === "link" ? (
              <form className="card" onSubmit={submitLink}>
                <SectionHead
                  icon={<LinkIcon />}
                  title="Adapt a recipe you found"
                />
                <p className="card-sub">
                  Paste any recipe URL and we&apos;ll swap ingredients to move
                  it toward your targets.
                </p>
                <div className="field-grid">
                  <div className="full-row">
                    <label htmlFor="recipeUrl">Recipe URL</label>
                    <input
                      id="recipeUrl"
                      type="url"
                      value={recipeUrl}
                      onChange={(e) => setRecipeUrl(e.target.value)}
                      placeholder="https://www.allrecipes.com/recipe/…"
                      required
                    />
                  </div>
                  <MacroTargetFields values={targets} onChange={setTarget} />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                >
                  {loading ? "Adapting the recipe…" : "Adapt to my macros"}
                </button>
              </form>
            ) : (
              <form className="card" onSubmit={submit}>
                <SectionHead
                  icon={<SearchIcon />}
                  title="What do you want to eat?"
                />
                <div className="field-grid">
                  <div className="full-row">
                    <label htmlFor="meal">Meal or dish</label>
                    <input
                      id="meal"
                      value={meal}
                      onChange={(e) => setMeal(e.target.value)}
                      placeholder="chicken alfredo, beef tacos, pad thai…"
                      required
                    />
                  </div>
                  <div className="full-row">
                    {geoStatus === "ok" ? (
                      <p className="geo-status ok">
                        <PinIcon />
                        Using your current location for nearby stores
                      </p>
                    ) : geoStatus === "detecting" ? (
                      <p className="geo-status">
                        <ClockIcon />
                        Detecting your location…
                      </p>
                    ) : (
                      <>
                        <label htmlFor="location">
                          Your location (city, state or zip)
                        </label>
                        <input
                          id="location"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="Austin, TX or 78701"
                          required
                        />
                      </>
                    )}
                  </div>
                  <MacroTargetFields values={targets} onChange={setTarget} />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                >
                  {loading ? "Crunching macros…" : "Build my meal"}
                </button>
              </form>
            )}

            <DailyBar log={dailyLog} />
          </aside>

          <section className="results">
            {error && (
              <div className="error">
                <AlertIcon />
                <span>{error}</span>
              </div>
            )}

            {loading && <ResultSkeleton mode={mode} />}

            {idle && (
              <div className="placeholder">
                <span className="placeholder-icon">
                  <BowlIcon />
                </span>
                <h3>
                  {mode === "find"
                    ? "Your meal plan shows up here"
                    : "Your adapted recipe shows up here"}
                </h3>
                <p>
                  {mode === "find"
                    ? "Tell us the dish and your targets, and we'll size the portion, swap ingredients, and price the trip."
                    : "Paste a recipe you already want to cook. We'll swap what helps, leave what doesn't, and size the portion."}
                </p>
              </div>
            )}

            {raw && (
              <div className="card">
                <SectionHead icon={<ReceiptIcon />} title="Result" />
                <pre className="raw">{raw}</pre>
              </div>
            )}

            {plan && (
              <>
                <div className="card">
                  {plan.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="meal-photo"
                      src={plan.imageUrl}
                      alt={plan.recipeName}
                    />
                  )}
                  <h2 className="recipe-title">{plan.recipeName}</h2>
                  <SourceChips url={plan.sourceUrl} servings={plan.servings} />
                  {plan.notes && <p className="notes">{plan.notes}</p>}
                </div>

                <div className="card">
                  <SectionHead
                    icon={<TargetIcon />}
                    title="Your portion, sized to your macros"
                  />
                  <div className="portion-rec">
                    <span>
                      Eat <strong>{describePortion(plan.fitMultiplier)}</strong>{" "}
                      to best match your targets
                    </span>
                    {plan.fittedCost !== null && (
                      <span className="portion-cost">
                        ~${plan.fittedCost.toFixed(2)} of ingredients
                      </span>
                    )}
                  </div>
                  <MacroRing macros={plan.fittedMacros} />
                  {submittedTarget && (
                    <FitBars
                      target={submittedTarget}
                      actual={plan.fittedMacros}
                    />
                  )}
                  <div className="orig-compare">
                    <label>
                      One full serving (of {plan.servings}), after swaps
                    </label>
                    <MacroPills macros={plan.modifiedMacros} dim />
                  </div>
                  <AddToDayButton
                    name={`${plan.recipeName} (${describePortion(plan.fitMultiplier)})`}
                    macros={plan.fittedMacros}
                    onAdd={dailyLog.addMeal}
                  />
                </div>

                {plan.swaps.length > 0 && (
                  <div className="card">
                    <SectionHead
                      icon={<SwapIcon />}
                      title="Ingredient swaps"
                      aside={
                        <span className="cost-badge">
                          {plan.swaps.length} change
                          {plan.swaps.length === 1 ? "" : "s"}
                        </span>
                      }
                    />
                    {plan.swaps.map((s, i) => (
                      <div className="swap" key={i}>
                        <div className="swap-line">
                          <span className="swap-from">{s.original}</span>
                          <SwapIcon className="swap-arrow" />
                          <span className="swap-to">{s.replacement}</span>
                        </div>
                        <div className="swap-why">{s.reason}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card">
                  <SectionHead
                    icon={<ReceiptIcon />}
                    title="Ingredients"
                    aside={
                      plan.recipeCost !== null ? (
                        <span className="cost-badge">
                          ${plan.recipeCost.toFixed(2)} total
                          {plan.costPerServing !== null &&
                            ` · $${plan.costPerServing.toFixed(2)}/serving`}
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="ing-list">
                    {plan.ingredients.map((ing, i) => (
                      <div className="ing-row" key={i}>
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
                            <span className="ing-price">
                              ~${ing.price.toFixed(2)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <SectionHead
                    icon={<CartIcon />}
                    title="Shopping list by aisle"
                  />
                  <p className="card-sub">
                    Grouped the way a store is laid out — check items off as you
                    go.
                  </p>
                  <GroceryList ingredients={plan.ingredients} />
                </div>

                <div className="card">
                  <SectionHead icon={<StepsIcon />} title="Instructions" />
                  <ol className="steps">
                    {plan.instructions.map((step, i) => (
                      <li className="step" key={i}>
                        <span className="step-num">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="card">
                  <SectionHead
                    icon={<PinIcon />}
                    title="Where to buy near you"
                  />
                  {plan.stores.map((s, i) => (
                    <div className="store" key={i}>
                      <div className="store-top">
                        <span className="store-name">{s.name}</span>
                        <span className="store-area">{s.area}</span>
                        {s.estCost !== null && (
                          <span className="store-cost">
                            ~${s.estCost.toFixed(2)} for all ingredients
                          </span>
                        )}
                      </div>
                      <div className="store-carries">{s.carries}</div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <SectionHead
                    icon={<NotebookIcon />}
                    title="Log this meal in your food diary"
                  />
                  <p className="log-help">
                    MyFitnessPal and MyNetDiary don&apos;t allow outside apps to
                    add food automatically, but both have a{" "}
                    <strong>Quick Add</strong> feature. Copy the numbers below
                    and paste them in — takes about 10 seconds.
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
                  <button
                    type="button"
                    className="btn btn-soft btn-block copy-btn"
                    onClick={copyMacros}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? "Copied" : "Copy meal + macros"}
                  </button>
                  <p className="log-help small">
                    MyFitnessPal: Diary → Add Food → Quick Add. MyNetDiary:
                    Dashboard → + → Quick add calories. Paste the copied text
                    into the notes so you remember what it was.
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
                  <h2 className="recipe-title">{analysis.title}</h2>
                  <SourceChips
                    url={analysis.sourceUrl}
                    servings={analysis.servings}
                  />
                  <p className="notes">{analysis.notes}</p>
                </div>

                <div className="card">
                  <SectionHead
                    icon={<TargetIcon />}
                    title={
                      analysis.adapted
                        ? "Adapted to your macros"
                        : analysis.perServing
                          ? "Nutrition per serving (estimated)"
                          : "Whole recipe (estimated)"
                    }
                  />
                  {analysis.adapted && (
                    <div className="portion-rec">
                      <span>
                        Eat{" "}
                        <strong>
                          {describePortion(
                            analysis.adapted.fitMultiplier,
                            analysis.adapted.basis,
                          )}
                        </strong>{" "}
                        to best match your targets
                      </span>
                    </div>
                  )}
                  <MacroRing
                    macros={
                      analysis.adapted
                        ? analysis.adapted.fittedMacros
                        : (analysis.perServing ?? analysis.totals)
                    }
                  />
                  {analysis.adapted && submittedTarget && (
                    <FitBars
                      target={submittedTarget}
                      actual={analysis.adapted.fittedMacros}
                    />
                  )}
                  <div className="orig-compare">
                    <label>
                      {analysis.adapted
                        ? `Original recipe, ${analysis.perServing ? "per serving" : "whole recipe"}`
                        : `Whole recipe (${analysis.servings} servings)`}
                    </label>
                    <MacroPills
                      macros={
                        analysis.adapted
                          ? (analysis.perServing ?? analysis.totals)
                          : analysis.totals
                      }
                      dim
                    />
                  </div>
                  <AddToDayButton
                    name={
                      analysis.adapted
                        ? `${analysis.title} (adapted, ${describePortion(analysis.adapted.fitMultiplier, analysis.adapted.basis)})`
                        : analysis.title
                    }
                    macros={
                      analysis.adapted
                        ? analysis.adapted.fittedMacros
                        : (analysis.perServing ?? analysis.totals)
                    }
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
                        `, ${Math.round(analysis.siteNutrition.fat)}g fat`}{" "}
                      — a good cross-check against the original estimates.
                    </p>
                  )}
                </div>

                {analysis.adapted && (
                  <div className="card">
                    <SectionHead
                      icon={<SwapIcon />}
                      title="Ingredient swaps"
                      aside={
                        analysis.adapted.swaps.length > 0 ? (
                          <span className="cost-badge">
                            {analysis.adapted.swaps.length} change
                            {analysis.adapted.swaps.length === 1 ? "" : "s"}
                          </span>
                        ) : undefined
                      }
                    />
                    {analysis.adapted.swaps.length > 0 ? (
                      analysis.adapted.swaps.map((s, i) => (
                        <div className="swap" key={i}>
                          <div className="swap-line">
                            <span className="swap-from">{s.original}</span>
                            <SwapIcon className="swap-arrow" />
                            <span className="swap-to">{s.replacement}</span>
                          </div>
                          <div className="swap-why">{s.reason}</div>
                        </div>
                      ))
                    ) : (
                      <p className="card-sub" style={{ margin: 0 }}>
                        No swaps applied — none of the available substitutions
                        would move this recipe closer to your targets. Adjust
                        the portion instead.
                      </p>
                    )}
                  </div>
                )}

                <div className="card">
                  <SectionHead
                    icon={<ReceiptIcon />}
                    title={
                      analysis.adapted
                        ? "Ingredients (adapted)"
                        : "Ingredients & nutrition facts"
                    }
                  />
                  <div className="nutri-list">
                    {(analysis.adapted?.ingredients ?? analysis.ingredients).map(
                      (ing, i) => {
                        // Index-aligned with the original list, so a differing
                        // line at the same position is exactly a swapped one.
                        const original = analysis.ingredients[i];
                        const wasSwapped =
                          original !== undefined && original.text !== ing.text;
                        return (
                          <div
                            className={
                              ing.skipped ? "nutri-row skipped" : "nutri-row"
                            }
                            key={i}
                          >
                            <span className="nutri-name">
                              {wasSwapped && (
                                <span className="swap-from">
                                  {original.text}
                                </span>
                              )}
                              {wasSwapped && " → "}
                              {ing.text}
                            </span>
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
                        );
                      },
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
