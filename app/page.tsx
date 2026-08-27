"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DayPlan,
  IngredientOverride,
  Macros,
  Mode,
  PlanResponse,
  Recipe,
  StoreEstimate,
} from "@/app/types";
import { consolidate } from "@/lib/shopping";
import {
  AddToDayButton,
  DailyBar,
  FitBars,
  MacroRing,
  ThemeToggle,
  useDailyLog,
} from "@/app/widgets";
import {
  IngredientEditor,
  KitchenPanel,
  SaveRecipeButton,
  ShoppingPanel,
  SwapPanel,
  TargetCalculator,
  useKitchen,
} from "@/app/panels";
import type { SavedRecipe } from "@/app/panels";
import {
  AlertIcon,
  BowlIcon,
  CalendarIcon,
  CartIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  LeafIcon,
  LinkIcon,
  NotebookIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  ReceiptIcon,
  ScaleIcon,
  SearchIcon,
  StepsIcon,
  SwapIcon,
  TargetIcon,
} from "@/app/icons";

/* ---------------- Target fields ---------------- */

type TargetKey = keyof Macros;

const TARGET_FIELDS: { key: TargetKey; label: string }[] = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
];

type TargetValues = Record<TargetKey, string>;

function MacroTargetFields({
  values,
  onChange,
  idPrefix,
}: {
  values: TargetValues;
  onChange: (key: TargetKey, value: string) => void;
  idPrefix: string;
}) {
  return (
    <>
      {TARGET_FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={`${idPrefix}-${f.key}`}>{f.label}</label>
          <input
            id={`${idPrefix}-${f.key}`}
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

const toMacros = (v: TargetValues): Macros => ({
  calories: Number(v.calories),
  protein: Number(v.protein),
  carbs: Number(v.carbs),
  fat: Number(v.fat),
});

const fromMacros = (m: Macros): TargetValues => ({
  calories: String(Math.round(m.calories)),
  protein: String(Math.round(m.protein)),
  carbs: String(Math.round(m.carbs)),
  fat: String(Math.round(m.fat)),
});

/* ---------------- Small presentational helpers ---------------- */

type GeoStatus = "detecting" | "ok" | "unavailable";

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
  assumed,
}: {
  url: string | null;
  servings: number | null;
  assumed?: boolean;
}) {
  return (
    <div className="meta-row">
      {url && (
        <a className="chip" href={url} target="_blank" rel="noreferrer">
          <LinkIcon />
          <span className="chip-text">{hostOf(url)}</span>
        </a>
      )}
      {servings !== null && (
        <span className="chip">
          <BowlIcon />
          {servings} serving{servings === 1 ? "" : "s"}
          {assumed ? " (assumed)" : ""}
        </span>
      )}
    </div>
  );
}

function ResultSkeleton({ mode }: { mode: Mode }) {
  const copy = {
    find: {
      title: "Building your meal",
      body: "Finding a recipe, swapping ingredients to fit your macros, and checking stores near you. This can take a minute or two.",
    },
    link: {
      title: "Reading the recipe",
      body: "Reading the page, estimating each ingredient, and testing swaps against your targets…",
    },
    day: {
      title: "Solving your day",
      body: "Finding each recipe, adapting it, then sizing every portion against the whole day at once.",
    },
  }[mode];

  return (
    <div className="card">
      <div className="loading-head">
        <span className="spinner" />
        <span>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
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

/* ================================================================== */

export default function Home() {
  /* ---- Inputs ---- */
  const [mode, setMode] = useState<Mode>("find");
  const [meal, setMeal] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [linkSource, setLinkSource] = useState<"url" | "paste">("url");
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteServings, setPasteServings] = useState("");
  const [dayMeals, setDayMeals] = useState<string[]>(["", "", ""]);

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

  const [targets, setTargets] = useState<TargetValues>({
    calories: "600",
    protein: "45",
    carbs: "50",
    fat: "20",
  });
  const [dailyTargets, setDailyTargets] = useState<TargetValues>({
    calories: "2000",
    protein: "150",
    carbs: "200",
    fat: "65",
  });

  /* ---- Results ---- */
  const [loading, setLoading] = useState(false);
  const [readapting, setReadapting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [stores, setStores] = useState<StoreEstimate[] | null>(null);
  const [servingsAssumed, setServingsAssumed] = useState(false);
  const [day, setDay] = useState<DayPlan | null>(null);
  const [submittedTarget, setSubmittedTarget] = useState<Macros | null>(null);
  const [overrides, setOverrides] = useState<Record<number, IngredientOverride>>(
    {},
  );
  const [vetoed, setVetoed] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const dailyLog = useDailyLog();
  const kitchen = useKitchen();

  /**
   * The shopping list is derived here rather than taken from the response.
   *
   * Correcting an ingredient or vetoing a swap changes what you have to buy,
   * and re-adaptation goes through /api/adapt, which knows nothing about
   * stores or baskets. Consolidating on the client keeps the list honest after
   * every edit for free — the function is pure and the data is already here.
   */
  const shopping = useMemo(() => {
    if (!recipe) return null;
    const lines = (
      recipe.adapted?.ingredients ?? recipe.original.ingredients
    ).map((i) => ({
      text: i.text,
      grams: i.grams,
      matchKey: i.matchKey,
      excluded: i.excluded,
    }));
    return consolidate([{ meal: recipe.title, lines }]);
  }, [recipe]);

  const setTarget = (key: TargetKey, value: string) =>
    setTargets((t) => ({ ...t, [key]: value }));
  const setDailyTarget = (key: TargetKey, value: string) =>
    setDailyTargets((t) => ({ ...t, [key]: value }));

  function resetResults() {
    setError(null);
    setCanPaste(false);
    setRecipe(null);
    setStores(null);
    setDay(null);
    setOverrides({});
    setVetoed([]);
  }

  function switchMode(m: Mode) {
    setMode(m);
    resetResults();
  }

  /* ---- Requests ---- */

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    resetResults();
    const target = toMacros(targets);
    setSubmittedTarget(target);

    try {
      const { ok, status, data } =
        linkSource === "url"
          ? await post("/api/analyze", { url: recipeUrl, macros: target })
          : await post("/api/adapt", {
              text: pasteText,
              title: pasteTitle,
              servings: pasteServings,
              macros: target,
            });
      if (!ok) {
        setError(data.error ?? `Request failed (${status})`);
        setCanPaste(data.canPaste === true);
      } else {
        setRecipe(data.recipe);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function submitFind(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    resetResults();
    const target = toMacros(targets);
    setSubmittedTarget(target);

    try {
      const { ok, status, data } = await post("/api/plan", {
        meal,
        ...(coords ? { coords } : { location }),
        macros: target,
      });
      if (!ok) {
        setError(data.error ?? `Request failed (${status})`);
      } else {
        const plan = data as PlanResponse;
        setRecipe(plan.recipe);
        setStores(plan.stores);
        setServingsAssumed(plan.servingsAssumed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function submitDay(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    resetResults();
    const target = toMacros(dailyTargets);
    setSubmittedTarget(target);

    try {
      const { ok, status, data } = await post("/api/day", {
        meals: dayMeals.filter((m) => m.trim().length > 0),
        macros: target,
      });
      if (!ok) setError(data.error ?? `Request failed (${status})`);
      else setDay(data.day);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-run the adaptation with the user's corrections and vetoes.
   *
   * Always /api/adapt, never the route the recipe originally came from: the
   * lines are already in hand, so there is nothing to re-fetch or re-search,
   * and skipping both keeps an edit feeling like an edit rather than a reload.
   */
  async function readapt(
    nextOverrides: Record<number, IngredientOverride>,
    nextVetoed: string[],
    source?: Recipe,
  ) {
    const base = source ?? recipe;
    if (!base || !submittedTarget) return;
    setReadapting(true);
    setError(null);
    try {
      const { ok, status, data } = await post("/api/adapt", {
        lines: base.lines,
        title: base.title,
        servings: base.servings,
        sourceUrl: base.sourceUrl,
        imageUrl: base.imageUrl,
        instructions: base.instructions,
        macros: submittedTarget,
        overrides: nextOverrides,
        vetoed: nextVetoed,
        skipEnrichment: true,
      });
      if (!ok) {
        setError(data.error ?? `Request failed (${status})`);
      } else {
        setRecipe(data.recipe);
        setOverrides(nextOverrides);
        setVetoed(nextVetoed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setReadapting(false);
    }
  }

  /** Re-solve a saved recipe against whatever targets are set right now. */
  async function openSaved(saved: SavedRecipe) {
    setMode("link");
    setLoading(true);
    resetResults();
    const target = toMacros(targets);
    setSubmittedTarget(target);
    try {
      const { ok, status, data } = await post("/api/adapt", {
        lines: saved.lines,
        title: saved.title,
        servings: saved.servings,
        sourceUrl: saved.sourceUrl,
        imageUrl: saved.imageUrl,
        macros: target,
        overrides: saved.overrides,
        vetoed: saved.vetoed,
      });
      if (!ok) {
        setError(data.error ?? `Request failed (${status})`);
      } else {
        setRecipe(data.recipe);
        setOverrides(saved.overrides);
        setVetoed(saved.vetoed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyMacros() {
    if (!recipe) return;
    const m =
      recipe.adapted?.fittedMacros ??
      recipe.original.perServing ??
      recipe.original.totals;
    const text = `${recipe.title} (macro-adjusted): ${Math.round(m.calories)} cals, ${Math.round(m.protein)}g protein, ${Math.round(m.carbs)}g carbs, ${Math.round(m.fat)}g fat`;
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

  const idle = !loading && !error && !recipe && !day;
  const adapted = recipe?.adapted ?? null;
  const shownMacros =
    adapted?.fittedMacros ??
    recipe?.original.perServing ??
    recipe?.original.totals ??
    null;

  /* ---------------- Render ---------------- */

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
            {(
              [
                ["find", "Find a meal", <SearchIcon key="s" />],
                ["link", "Adapt a recipe", <LinkIcon key="l" />],
                ["day", "Plan a day", <CalendarIcon key="c" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                type="button"
                role="tab"
                key={key}
                aria-selected={mode === key}
                className={mode === key ? "tab active" : "tab"}
                onClick={() => switchMode(key)}
              >
                {icon}
                {label}
              </button>
            ))}
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
            {mode === "link" && (
              <form className="card" onSubmit={submitLink}>
                <SectionHead
                  icon={<LinkIcon />}
                  title="Adapt a recipe you found"
                />
                <div className="source-toggle" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={linkSource === "url"}
                    className={linkSource === "url" ? "src active" : "src"}
                    onClick={() => setLinkSource("url")}
                  >
                    From a link
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={linkSource === "paste"}
                    className={linkSource === "paste" ? "src active" : "src"}
                    onClick={() => setLinkSource("paste")}
                  >
                    Paste the ingredients
                  </button>
                </div>

                <div className="field-grid">
                  {linkSource === "url" ? (
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
                      <p className="field-hint">
                        Works on any site that publishes standard recipe
                        markup. If it doesn&apos;t, paste the list instead —
                        that always works.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="full-row">
                        <label htmlFor="pasteText">
                          Ingredients, one per line
                        </label>
                        <textarea
                          id="pasteText"
                          rows={8}
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          placeholder={
                            "400 g spaghetti\n200 g bacon, diced\n2 large eggs\n100 g parmesan\n200 ml heavy cream"
                          }
                          required
                        />
                        <p className="field-hint">
                          Include the amounts — they&apos;re what the macros are
                          worked out from. Bullets and numbering are fine.
                        </p>
                      </div>
                      <div>
                        <label htmlFor="pasteTitle">Name (optional)</label>
                        <input
                          id="pasteTitle"
                          value={pasteTitle}
                          onChange={(e) => setPasteTitle(e.target.value)}
                          placeholder="Grandma's carbonara"
                        />
                      </div>
                      <div>
                        <label htmlFor="pasteServings">Servings</label>
                        <input
                          id="pasteServings"
                          type="number"
                          min="1"
                          value={pasteServings}
                          onChange={(e) => setPasteServings(e.target.value)}
                          placeholder="4"
                        />
                      </div>
                    </>
                  )}
                  <MacroTargetFields
                    values={targets}
                    onChange={setTarget}
                    idPrefix="link"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                >
                  {loading ? "Adapting the recipe…" : "Adapt to my macros"}
                </button>
              </form>
            )}

            {mode === "find" && (
              <form className="card" onSubmit={submitFind}>
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
                  <MacroTargetFields
                    values={targets}
                    onChange={setTarget}
                    idPrefix="find"
                  />
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

            {mode === "day" && (
              <form className="card" onSubmit={submitDay}>
                <SectionHead
                  icon={<CalendarIcon />}
                  title="Plan a whole day"
                />
                <p className="card-sub">
                  Name the dishes you want. Portions get solved across all of
                  them at once, so a heavier meal can be paid for by a lighter
                  one.
                </p>
                <div className="field-grid">
                  <div className="full-row">
                    <label>Meals</label>
                    {dayMeals.map((value, i) => (
                      <div className="day-input" key={i}>
                        <input
                          value={value}
                          onChange={(e) =>
                            setDayMeals((prev) =>
                              prev.map((v, j) =>
                                j === i ? e.target.value : v,
                              ),
                            )
                          }
                          placeholder={
                            ["breakfast — omelette", "lunch — chicken salad", "dinner — carbonara", "another dish", "another dish"][i]
                          }
                          aria-label={`Meal ${i + 1}`}
                        />
                        {dayMeals.length > 1 && (
                          <button
                            type="button"
                            className="day-remove"
                            onClick={() =>
                              setDayMeals((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                            aria-label={`Remove meal ${i + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {dayMeals.length < 5 && (
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => setDayMeals((prev) => [...prev, ""])}
                      >
                        <PlusIcon />
                        Add another meal
                      </button>
                    )}
                  </div>
                  <div className="full-row">
                    <label>Daily targets</label>
                  </div>
                  <MacroTargetFields
                    values={dailyTargets}
                    onChange={setDailyTarget}
                    idPrefix="day"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={loading}
                >
                  {loading ? "Solving your day…" : "Plan my day"}
                </button>
              </form>
            )}

            <TargetCalculator
              onApply={(perMeal, daily) => {
                setTargets(fromMacros(perMeal));
                setDailyTargets(fromMacros(daily));
                dailyLog.setGoals(daily);
              }}
            />
            <KitchenPanel
              kitchen={kitchen}
              onOpen={openSaved}
              busy={loading || readapting}
            />
            <DailyBar log={dailyLog} />
          </aside>

          <section className="results">
            {error && (
              <div className="error">
                <AlertIcon />
                <span>
                  {error}
                  {canPaste && (
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => {
                        setLinkSource("paste");
                        setError(null);
                        setCanPaste(false);
                      }}
                    >
                      <PencilIcon />
                      Paste the ingredient list instead
                    </button>
                  )}
                </span>
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
                    : mode === "link"
                      ? "Your adapted recipe shows up here"
                      : "Your day shows up here"}
                </h3>
                <p>
                  {mode === "find"
                    ? "Tell us the dish and your targets, and we'll size the portion, swap ingredients, and price the trip."
                    : mode === "link"
                      ? "Paste a recipe you already want to cook. We'll swap what helps, leave what doesn't, and size the portion."
                      : "Name a few dishes and a daily target. Every portion gets solved together, and the shopping list is merged into one trip."}
                </p>
              </div>
            )}

            {/* ---------------- Single recipe ---------------- */}

            {recipe && shownMacros && (
              <>
                <div className="card">
                  {recipe.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="meal-photo"
                      src={recipe.imageUrl}
                      alt={recipe.title}
                    />
                  )}
                  <h2 className="recipe-title">{recipe.title}</h2>
                  <SourceChips
                    url={recipe.sourceUrl}
                    servings={recipe.servings}
                    assumed={servingsAssumed}
                  />
                  <p className="notes">{recipe.notes}</p>
                </div>

                <div className="card">
                  <SectionHead
                    icon={<TargetIcon />}
                    title={
                      adapted
                        ? "Your portion, sized to your macros"
                        : recipe.original.perServing
                          ? "Nutrition per serving (estimated)"
                          : "Whole recipe (estimated)"
                    }
                  />
                  {adapted && (
                    <div className="portion-rec">
                      <span>
                        Eat{" "}
                        <strong>
                          {describePortion(
                            adapted.fitMultiplier,
                            adapted.basis,
                          )}
                        </strong>{" "}
                        to best match your targets
                      </span>
                      {adapted.fittedCost !== null && (
                        <span className="portion-cost">
                          ~${adapted.fittedCost.toFixed(2)} of ingredients
                        </span>
                      )}
                    </div>
                  )}
                  <MacroRing macros={shownMacros} />
                  {adapted && submittedTarget && (
                    <FitBars target={submittedTarget} actual={shownMacros} />
                  )}
                  <div className="orig-compare">
                    <label>
                      Original recipe,{" "}
                      {recipe.original.perServing
                        ? "per serving"
                        : "whole recipe"}
                    </label>
                    <MacroPills
                      macros={
                        recipe.original.perServing ?? recipe.original.totals
                      }
                      dim
                    />
                  </div>
                  <div className="result-actions">
                    <AddToDayButton
                      name={
                        adapted
                          ? `${recipe.title} (${describePortion(adapted.fitMultiplier, adapted.basis)})`
                          : recipe.title
                      }
                      macros={shownMacros}
                      onAdd={dailyLog.addMeal}
                    />
                    <SaveRecipeButton
                      recipe={recipe}
                      target={submittedTarget}
                      overrides={overrides}
                      vetoed={vetoed}
                      kitchen={kitchen}
                    />
                  </div>
                  {recipe.siteNutrition && (
                    <p className="notes">
                      The recipe site reports per serving:{" "}
                      {recipe.siteNutrition.calories !== null &&
                        `${Math.round(recipe.siteNutrition.calories)} cals`}
                      {recipe.siteNutrition.protein !== null &&
                        `, ${Math.round(recipe.siteNutrition.protein)}g protein`}
                      {recipe.siteNutrition.carbs !== null &&
                        `, ${Math.round(recipe.siteNutrition.carbs)}g carbs`}
                      {recipe.siteNutrition.fat !== null &&
                        `, ${Math.round(recipe.siteNutrition.fat)}g fat`}{" "}
                      — a good cross-check against the estimates above.
                    </p>
                  )}
                </div>

                {adapted && (
                  <div className="card">
                    <SectionHead
                      icon={<SwapIcon />}
                      title="Ingredient swaps"
                      aside={
                        adapted.swaps.length > 0 ? (
                          <span className="cost-badge">
                            {adapted.swaps.length} change
                            {adapted.swaps.length === 1 ? "" : "s"}
                          </span>
                        ) : undefined
                      }
                    />
                    <SwapPanel
                      swaps={adapted.swaps}
                      rejected={adapted.rejected}
                      vetoed={vetoed}
                      onVetoChange={(next) => readapt(overrides, next)}
                      busy={readapting}
                    />
                  </div>
                )}

                <div className="card">
                  <SectionHead
                    icon={<ReceiptIcon />}
                    title={adapted ? "Ingredients (adapted)" : "Ingredients"}
                    aside={
                      (adapted?.recipeCost ?? recipe.original.recipeCost) !==
                      null ? (
                        <span className="cost-badge">
                          $
                          {(
                            adapted?.recipeCost ?? recipe.original.recipeCost
                          )?.toFixed(2)}{" "}
                          total
                          {adapted?.costPerServing != null &&
                            ` · $${adapted.costPerServing.toFixed(2)}/serving`}
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="nutri-list">
                    {(adapted?.ingredients ?? recipe.original.ingredients).map(
                      (ing, i) => {
                        // Index-aligned with the original list, so a differing
                        // line at the same position is exactly a swapped one.
                        const original = recipe.original.ingredients[i];
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
                              {ing.editedFood || ing.editedGrams ? (
                                <span className="editor-tag">edited</span>
                              ) : null}
                            </span>
                            <span className="ing-side">
                              {ing.excluded ? (
                                <span className="nutri-facts muted">
                                  skipped by you
                                </span>
                              ) : ing.skipped ? (
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
                                <span className="nutri-facts muted">
                                  no data
                                </span>
                              )}
                              {ing.price !== null && (
                                <span className="ing-price">
                                  ~${ing.price.toFixed(2)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                  <IngredientEditor
                    ingredients={
                      adapted?.ingredients ?? recipe.original.ingredients
                    }
                    lines={recipe.lines}
                    overrides={overrides}
                    onApply={(next) => readapt(next, vetoed)}
                    busy={readapting}
                  />
                </div>

                {shopping && shopping.items.length > 0 && (
                  <div className="card">
                    <SectionHead
                      icon={<CartIcon />}
                      title="Shopping list by aisle"
                    />
                    <p className="card-sub">
                      Grouped the way a store is laid out — check items off as
                      you go.
                    </p>
                    <ShoppingPanel
                      list={shopping}
                      title={`${recipe.title} — shopping list`}
                      meals={[recipe.title]}
                    />
                  </div>
                )}

                {recipe.instructions.length > 0 && (
                  <div className="card">
                    <SectionHead icon={<StepsIcon />} title="Instructions" />
                    <ol className="steps">
                      {recipe.instructions.map((step, i) => (
                        <li className="step" key={i}>
                          <span className="step-num">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {stores && (
                  <div className="card">
                    <SectionHead
                      icon={<PinIcon />}
                      title="Where to buy near you"
                    />
                    {stores.map((s, i) => (
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
                )}

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
                    {TARGET_FIELDS.map((f) => (
                      <div className="log-row" key={f.key}>
                        <span className="log-label">
                          {f.label.replace(" (g)", "")}
                        </span>
                        <span className="log-num">
                          {Math.round(shownMacros[f.key])}
                          {f.key === "calories" ? "" : " g"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft btn-block copy-btn"
                    onClick={copyMacros}
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? "Copied" : "Copy meal + macros"}
                  </button>
                </div>
              </>
            )}

            {/* ---------------- A whole day ---------------- */}

            {day && (
              <>
                <div className="card">
                  <SectionHead
                    icon={<ScaleIcon />}
                    title="Your day, solved together"
                  />
                  <MacroRing macros={day.totals} />
                  <FitBars target={day.target} actual={day.totals} />
                  <p className="notes">{day.notes}</p>
                  <AddToDayButton
                    name={`Full day (${day.meals.length} meals)`}
                    macros={day.totals}
                    onAdd={dailyLog.addMeal}
                  />
                </div>

                {day.meals.map((m, i) => (
                  <div className="card" key={i}>
                    <div className="day-meal-head">
                      {m.recipe.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="day-thumb"
                          src={m.recipe.imageUrl}
                          alt={m.recipe.title}
                        />
                      )}
                      <div>
                        <h2 className="recipe-title">{m.recipe.title}</h2>
                        <SourceChips
                          url={m.recipe.sourceUrl}
                          servings={m.recipe.servings}
                          assumed
                        />
                      </div>
                    </div>
                    <div className="portion-rec">
                      <span>
                        Eat <strong>{describePortion(m.portion)}</strong> of
                        this one
                      </span>
                      {m.cost !== null && (
                        <span className="portion-cost">
                          ~${m.cost.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <MacroPills macros={m.macros} />
                    {m.recipe.adapted && m.recipe.adapted.swaps.length > 0 && (
                      <div className="day-swaps">
                        {m.recipe.adapted.swaps.map((s) => (
                          <div className="swap-line" key={s.id}>
                            <span className="swap-from">{s.original}</span>
                            <SwapIcon className="swap-arrow" />
                            <span className="swap-to">{s.replacement}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <AddToDayButton
                      name={`${m.recipe.title} (${describePortion(m.portion)})`}
                      macros={m.macros}
                      onAdd={dailyLog.addMeal}
                    />
                  </div>
                ))}

                <div className="card">
                  <SectionHead
                    icon={<CartIcon />}
                    title="One shopping trip for the whole day"
                  />
                  <p className="card-sub">
                    Ingredients shared between meals are merged into a single
                    line, so you buy the chicken once.
                  </p>
                  <ShoppingPanel
                    list={day.shopping}
                    title="Day plan — shopping list"
                    meals={day.meals.map((m) => m.recipe.title)}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
