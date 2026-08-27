"use client";

/**
 * The larger interactive panels: the ones that let someone argue with the app
 * rather than just read it. Each of these exists because an estimate the user
 * can't correct is an estimate they can't trust.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  AppliedSwap,
  IngredientOverride,
  Macros,
  PricedIngredient,
  RecipeResult,
  RejectedSwap,
  ShoppingList,
} from "@/app/types";
import { staticFoodKeys } from "@/lib/nutrition";
import { byAisle, formatGrams, toPlainText } from "@/lib/shopping";
import {
  ACTIVITY_LEVELS,
  GOALS,
  PRESETS,
  computeTargets,
  feetInchesToCm,
  lbToKg,
} from "@/lib/tdee";
import type { ActivityLevel, GoalKey, PresetKey, Sex } from "@/lib/tdee";
import {
  AlertIcon,
  BookmarkIcon,
  CalculatorIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  InfoIcon,
  PencilIcon,
  SwapIcon,
  TrashIcon,
  UndoIcon,
} from "@/app/icons";

/* ==================================================================
   Ingredient editor — correcting what the parser guessed
   ================================================================== */

const FOOD_KEYS = staticFoodKeys().slice().sort();

function macroSummary(macros: Macros | null): string {
  if (!macros) return "no data";
  return `${Math.round(macros.calories)} cals · ${Math.round(macros.protein)}P · ${Math.round(macros.carbs)}C · ${Math.round(macros.fat)}F`;
}

/**
 * The parsed ingredient table, with every guess exposed and editable.
 *
 * The macro numbers rest on two guesses per line — which food this is, and how
 * much of it — and both are wrong often enough to matter. Showing them as
 * editable fields turns "estimated" from a disclaimer into something the user
 * can act on: fix the one line that's off, and every number above it moves.
 *
 * Edits are held locally and committed on demand rather than on every
 * keystroke, because each commit re-runs the whole adaptation on the server.
 */
export function IngredientEditor({
  ingredients,
  lines,
  overrides,
  onApply,
  busy,
}: {
  ingredients: PricedIngredient[];
  lines: string[];
  overrides: Record<number, IngredientOverride>;
  onApply: (next: Record<number, IngredientOverride>) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, IngredientOverride>>(overrides);

  // A fresh recipe arrives with its own overrides; drop any half-finished edits
  // rather than applying them to a list they were never about.
  useEffect(() => setDraft(overrides), [overrides]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(overrides);
  const unmatched = ingredients.filter(
    (i) => !i.skipped && i.macros === null,
  ).length;

  function set(index: number, patch: IngredientOverride) {
    setDraft((prev) => {
      const next = { ...prev };
      const merged = { ...next[index], ...patch };
      // An override of nothing is no override — keep the payload clean so a
      // cleared field really does hand the line back to the parser.
      const cleaned: IngredientOverride = {};
      if (merged.foodKey) cleaned.foodKey = merged.foodKey;
      if (merged.grams != null) cleaned.grams = merged.grams;
      if (merged.exclude) cleaned.exclude = true;
      if (Object.keys(cleaned).length === 0) delete next[index];
      else next[index] = cleaned;
      return next;
    });
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <button
          type="button"
          className="btn-quiet"
          onClick={() => setOpen((o) => !o)}
        >
          <PencilIcon />
          {open ? "Done editing" : "Check or correct these ingredients"}
        </button>
        {unmatched > 0 && !open && (
          <span className="editor-flag">
            <AlertIcon />
            {unmatched} not identified
          </span>
        )}
      </div>

      {open && (
        <>
          <p className="card-sub editor-intro">
            Every line below is a guess at what the ingredient is and how much
            it weighs. Change either one and the macros, swaps and portion all
            get worked out again.
          </p>

          <div className="editor-rows">
            {ingredients.map((ing, i) => {
              const edit = draft[i] ?? {};
              const excluded = edit.exclude === true;
              const seasoning = ing.skipped && !ing.excluded;
              return (
                <div
                  className={`editor-row${excluded ? " excluded" : ""}`}
                  key={i}
                >
                  <div className="editor-text">
                    {lines[i] ?? ing.text}
                    {ing.matchSource === "external" && (
                      <span className="editor-tag">USDA</span>
                    )}
                    {seasoning && (
                      <span className="editor-tag muted">seasoning</span>
                    )}
                  </div>

                  <div className="editor-fields">
                    <label className="editor-field">
                      <span>Food</span>
                      <select
                        value={edit.foodKey ?? ""}
                        disabled={excluded}
                        onChange={(e) =>
                          set(i, { foodKey: e.target.value || null })
                        }
                      >
                        <option value="">
                          {ing.matchKey
                            ? `auto — ${ing.matchKey}`
                            : "auto — not identified"}
                        </option>
                        {FOOD_KEYS.map((key) => (
                          <option value={key} key={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="editor-field narrow">
                      <span>Grams</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={excluded}
                        placeholder={
                          ing.grams !== null ? String(ing.grams) : "?"
                        }
                        value={edit.grams ?? ""}
                        onChange={(e) =>
                          set(i, {
                            grams:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="editor-skip">
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={(e) =>
                          set(i, { exclude: e.target.checked || undefined })
                        }
                      />
                      <span>Skip</span>
                    </label>
                  </div>

                  <div className="editor-macros">
                    {excluded ? "not counted" : macroSummary(ing.macros)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="editor-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || busy}
              onClick={() => onApply(draft)}
            >
              {busy ? "Recalculating…" : "Apply corrections"}
            </button>
            {dirty && (
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setDraft(overrides)}
              >
                Discard changes
              </button>
            )}
            {Object.keys(overrides).length > 0 && !dirty && (
              <button
                type="button"
                className="btn-quiet danger"
                disabled={busy}
                onClick={() => onApply({})}
              >
                Reset every correction
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ==================================================================
   Swaps — what was changed, why, and what wasn't
   ================================================================== */

function deltaText(delta: Macros): string {
  const bits: [number, string][] = [
    [Math.round(delta.calories), "cal"],
    [Math.round(delta.protein), "g protein"],
    [Math.round(delta.carbs), "g carbs"],
    [Math.round(delta.fat), "g fat"],
  ];
  const shown = bits
    .filter(([value]) => value !== 0)
    .map(([value, unit]) => `${value > 0 ? "+" : ""}${value} ${unit}`);
  return shown.length > 0 ? shown.join(", ") : "no measurable change";
}

/**
 * Every swap, with the arithmetic that justified it and a way to refuse it.
 *
 * The search's whole claim is that it only makes changes that help, so it
 * should be willing to show its work: what each swap did to the plate, and how
 * far it moved the fit score. Fit error is unitless and meaningless on its
 * own, so it's reported as a percentage improvement rather than a raw number.
 *
 * Rejected candidates are shown too. "We considered trading the bacon and it
 * would have made your fit worse" is a real answer, and it is the one that
 * stops the absence of a swap from reading as an oversight.
 */
export function SwapPanel({
  swaps,
  rejected,
  vetoed,
  onVetoChange,
  busy,
}: {
  swaps: AppliedSwap[];
  rejected: RejectedSwap[];
  vetoed: string[];
  onVetoChange: (next: string[]) => void;
  busy: boolean;
}) {
  const [showPassed, setShowPassed] = useState(false);
  const vetoedSwaps = rejected.filter((r) => r.outcome === "vetoed");
  const passedOver = rejected.filter((r) => r.outcome === "no-improvement");

  const improvement = (before: number, after: number) =>
    before > 0 ? Math.round((1 - after / before) * 100) : 0;

  return (
    <div className="swaps">
      {swaps.length === 0 && vetoedSwaps.length === 0 && (
        <p className="card-sub" style={{ margin: 0 }}>
          No swaps applied — nothing available would move this recipe closer to
          your targets. Adjust the portion instead.
        </p>
      )}

      {swaps.map((s) => (
        <div className="swap" key={s.id}>
          <div className="swap-line">
            <span className="swap-from">{s.original}</span>
            <SwapIcon className="swap-arrow" />
            <span className="swap-to">{s.replacement}</span>
          </div>
          <div className="swap-why">{s.reason}</div>
          <div className="swap-math">
            <span className="swap-delta">{deltaText(s.delta)} per serving</span>
            <span className="swap-score">
              fit {improvement(s.errorBefore, s.errorAfter)}% better
            </span>
            {s.source === "family" && (
              <span className="swap-origin">same-family substitution</span>
            )}
          </div>
          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={() => onVetoChange([...vetoed, s.id])}
          >
            <CloseIcon />
            Don&apos;t use this swap
          </button>
        </div>
      ))}

      {vetoedSwaps.map((r) => (
        <div className="swap vetoed" key={r.id}>
          <div className="swap-line">
            <span className="swap-from">{r.original}</span>
            <SwapIcon className="swap-arrow" />
            <span className="swap-to">{r.replacement}</span>
          </div>
          <div className="swap-why">
            You turned this one down.{" "}
            {r.errorAfter < r.errorBefore
              ? `It would have improved the fit by ${improvement(r.errorBefore, r.errorAfter)}%.`
              : "It wouldn't have helped the fit anyway."}
          </div>
          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={() => onVetoChange(vetoed.filter((id) => id !== r.id))}
          >
            <UndoIcon />
            Put it back
          </button>
        </div>
      ))}

      {passedOver.length > 0 && (
        <div className="passed">
          <button
            type="button"
            className="btn-quiet"
            onClick={() => setShowPassed((s) => !s)}
          >
            <InfoIcon />
            {showPassed ? "Hide" : "Show"} the {passedOver.length} substitution
            {passedOver.length === 1 ? "" : "s"} that were considered and passed
            over
          </button>
          {showPassed && (
            <div className="passed-list">
              {passedOver.map((r) => (
                <div className="passed-row" key={r.id}>
                  <span className="passed-swap">
                    {r.original} → {r.replacement}
                  </span>
                  <span className="passed-why">
                    {r.errorAfter > r.errorBefore
                      ? `would have made the fit ${Math.round((r.errorAfter / r.errorBefore - 1) * 100)}% worse`
                      : "no better than leaving it alone"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   Target calculator — where the four numbers come from
   ================================================================== */

const CALC_KEY = "macrochef-body";

interface CalcState {
  sex: Sex;
  age: string;
  feet: string;
  inches: string;
  pounds: string;
  activity: ActivityLevel;
  goal: GoalKey;
  preset: PresetKey;
  mealsPerDay: string;
}

const CALC_DEFAULT: CalcState = {
  sex: "male",
  age: "30",
  feet: "5",
  inches: "10",
  pounds: "170",
  activity: "moderate",
  goal: "maintain",
  preset: "balanced",
  mealsPerDay: "3",
};

/**
 * Body stats to macro targets.
 *
 * Most people don't know their macros, and asking for four numbers up front is
 * the step where the app loses them. This asks for things they do know and
 * does the arithmetic, then hands back both a daily target and a per-meal one
 * — the app works in single meals, but a day is what a goal is actually set in.
 */
export function TargetCalculator({
  onApply,
}: {
  onApply: (perMeal: Macros, daily: Macros) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CalcState>(CALC_DEFAULT);

  // Body stats don't change between visits; asking for them twice is rude.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALC_KEY);
      if (raw) setState({ ...CALC_DEFAULT, ...JSON.parse(raw) });
    } catch {
      // corrupt or blocked storage — the defaults are fine
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CALC_KEY, JSON.stringify(state));
    } catch {
      // storage blocked — the calculator still works for this visit
    }
  }, [state]);

  const set = <K extends keyof CalcState>(key: K, value: CalcState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const result = useMemo(() => {
    const pounds = Number(state.pounds);
    const age = Number(state.age);
    const feet = Number(state.feet);
    const inches = Number(state.inches);
    if (!(pounds > 0) || !(age > 0) || !(feet > 0)) return null;
    return computeTargets(
      {
        sex: state.sex,
        age,
        weightKg: lbToKg(pounds),
        heightCm: feetInchesToCm(feet, inches || 0),
        activity: state.activity,
      },
      state.goal,
      state.preset,
      Number(state.mealsPerDay) || 3,
    );
  }, [state]);

  return (
    <div className="calc card">
      <button
        type="button"
        className="calc-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sec-icon">
          <CalculatorIcon />
        </span>
        <span>
          <span className="calc-title">Not sure of your macros?</span>
          <span className="calc-sub">Work them out from your body and goal</span>
        </span>
      </button>

      {open && (
        <div className="calc-body">
          <div className="calc-grid">
            <div>
              <label htmlFor="calc-sex">Sex</label>
              <select
                id="calc-sex"
                value={state.sex}
                onChange={(e) => set("sex", e.target.value as Sex)}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label htmlFor="calc-age">Age</label>
              <input
                id="calc-age"
                type="number"
                min="14"
                max="100"
                value={state.age}
                onChange={(e) => set("age", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="calc-feet">Height</label>
              <div className="calc-height">
                <input
                  id="calc-feet"
                  type="number"
                  min="3"
                  max="8"
                  value={state.feet}
                  onChange={(e) => set("feet", e.target.value)}
                  aria-label="Height, feet"
                />
                <span>ft</span>
                <input
                  type="number"
                  min="0"
                  max="11"
                  value={state.inches}
                  onChange={(e) => set("inches", e.target.value)}
                  aria-label="Height, inches"
                />
                <span>in</span>
              </div>
            </div>
            <div>
              <label htmlFor="calc-weight">Weight (lb)</label>
              <input
                id="calc-weight"
                type="number"
                min="60"
                max="600"
                value={state.pounds}
                onChange={(e) => set("pounds", e.target.value)}
              />
            </div>
            <div className="full-row">
              <label htmlFor="calc-activity">How active are you?</label>
              <select
                id="calc-activity"
                value={state.activity}
                onChange={(e) =>
                  set("activity", e.target.value as ActivityLevel)
                }
              >
                {ACTIVITY_LEVELS.map((a) => (
                  <option value={a.key} key={a.key}>
                    {a.label} — {a.detail}
                  </option>
                ))}
              </select>
            </div>
            <div className="full-row">
              <label htmlFor="calc-goal">Goal</label>
              <select
                id="calc-goal"
                value={state.goal}
                onChange={(e) => set("goal", e.target.value as GoalKey)}
              >
                {GOALS.map((g) => (
                  <option value={g.key} key={g.key}>
                    {g.label} — {g.detail}
                  </option>
                ))}
              </select>
            </div>
            <div className="full-row">
              <label htmlFor="calc-preset">Macro split</label>
              <select
                id="calc-preset"
                value={state.preset}
                onChange={(e) => set("preset", e.target.value as PresetKey)}
              >
                {PRESETS.map((p) => (
                  <option value={p.key} key={p.key}>
                    {p.label} — {p.detail}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="calc-meals">Meals a day</label>
              <input
                id="calc-meals"
                type="number"
                min="1"
                max="8"
                value={state.mealsPerDay}
                onChange={(e) => set("mealsPerDay", e.target.value)}
              />
            </div>
          </div>

          {result && (
            <>
              <div className="calc-result">
                <div className="calc-line">
                  <span>Resting burn</span>
                  <strong>{result.bmr} cals</strong>
                </div>
                <div className="calc-line">
                  <span>Maintenance</span>
                  <strong>{result.maintenance} cals</strong>
                </div>
                <div className="calc-line total">
                  <span>Your daily target</span>
                  <strong>
                    {result.daily.calories} cals · {result.daily.protein}P ·{" "}
                    {result.daily.carbs}C · {result.daily.fat}F
                  </strong>
                </div>
                <div className="calc-line">
                  <span>Per meal</span>
                  <strong>
                    {result.perMeal.calories} cals · {result.perMeal.protein}P ·{" "}
                    {result.perMeal.carbs}C · {result.perMeal.fat}F
                  </strong>
                </div>
              </div>

              {result.proteinFloorApplied && (
                <p className="calc-note">
                  Protein was raised above the split&apos;s percentage to keep
                  it at a level that protects muscle in a deficit.
                </p>
              )}

              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => onApply(result.perMeal, result.daily)}
              >
                <CheckIcon />
                Use these targets
              </button>
              <p className="calc-note">
                Estimates for a healthy adult, from the Mifflin-St Jeor
                equation. Two people with identical stats can differ by around
                10% — treat these as a starting point and adjust from what the
                scale actually does.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   Shopping list — consolidated, checkable, exportable
   ================================================================== */

export function ShoppingPanel({
  list,
  title,
  meals,
}: {
  list: ShoppingList;
  title: string;
  meals: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // A new list is a new trip; carrying ticks across would be actively wrong.
  useEffect(() => setChecked(new Set()), [list]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copy() {
    const text = toPlainText(list, { title, meals });
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

  if (list.items.length === 0) {
    return <p className="card-sub">Nothing to buy yet.</p>;
  }

  return (
    <div className="grocery">
      {byAisle(list.items).map(([aisle, items]) => {
        const done = items.filter((i) => checked.has(i.id)).length;
        return (
          <div className="grocery-section" key={aisle}>
            <div className="grocery-aisle">
              {aisle}
              <span className="grocery-count">
                {done}/{items.length}
              </span>
            </div>
            {items.map((item) => (
              <label
                className={
                  checked.has(item.id) ? "grocery-item done" : "grocery-item"
                }
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="grocery-text">
                  {item.label}
                  <span className="grocery-qty">{formatGrams(item.grams)}</span>
                  {item.merged && (
                    <span className="grocery-for">
                      for {item.meals.join(" + ")}
                    </span>
                  )}
                </span>
                {item.price !== null && (
                  <span className="grocery-price">
                    ~${item.price.toFixed(2)}
                  </span>
                )}
              </label>
            ))}
          </div>
        );
      })}

      <div className="grocery-foot">
        {list.total !== null && (
          <span className="grocery-total">
            ~${list.total.toFixed(2)} estimated
            {list.unpriced > 0 &&
              `, plus ${list.unpriced} item${list.unpriced === 1 ? "" : "s"} we couldn't price`}
          </span>
        )}
        <button type="button" className="btn btn-soft" onClick={copy}>
          {copied ? <CheckIcon /> : <ClipboardIcon />}
          {copied ? "Copied" : "Copy list as text"}
        </button>
      </div>
    </div>
  );
}

/* ==================================================================
   Kitchen — recipes kept between visits
   ================================================================== */

const KITCHEN_KEY = "macrochef-kitchen";

export interface SavedRecipe {
  id: string;
  savedAt: number;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  lines: string[];
  overrides: Record<number, IngredientOverride>;
  vetoed: string[];
  /** The target it was adapted to when saved, for the comparison view. */
  target: Macros | null;
  /** Macros as written, and as adapted — enough to show the trade at a glance. */
  originalMacros: Macros | null;
  adaptedMacros: Macros | null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

/**
 * Saved recipes, in localStorage.
 *
 * Deliberately not an account: the app needs no keys and no sign-in, and a
 * recipe list is not worth breaking that for. What gets stored is the
 * ingredient *lines* plus the user's corrections and vetoes — not the computed
 * macros — so re-opening a saved recipe against a new target re-solves it
 * rather than replaying a stale answer.
 */
export function useKitchen() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KITCHEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecipes(parsed);
      }
    } catch {
      // corrupt storage — start with an empty kitchen
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KITCHEN_KEY, JSON.stringify(recipes));
    } catch {
      // storage full or blocked — non-fatal
    }
  }, [recipes, hydrated]);

  const save = (recipe: Omit<SavedRecipe, "id" | "savedAt">) => {
    setRecipes((prev) => {
      // Re-saving the same source replaces it rather than piling up copies.
      const without = prev.filter(
        (r) =>
          !(
            r.title === recipe.title &&
            r.sourceUrl === recipe.sourceUrl
          ),
      );
      return [{ ...recipe, id: newId(), savedAt: Date.now() }, ...without].slice(
        0,
        40,
      );
    });
  };
  const remove = (id: string) =>
    setRecipes((prev) => prev.filter((r) => r.id !== id));

  const isSaved = (title: string, sourceUrl: string | null) =>
    recipes.some((r) => r.title === title && r.sourceUrl === sourceUrl);

  return { recipes, hydrated, save, remove, isSaved };
}

export type Kitchen = ReturnType<typeof useKitchen>;

export function SaveRecipeButton({
  recipe,
  target,
  overrides,
  vetoed,
  kitchen,
}: {
  recipe: RecipeResult & { lines: string[] };
  target: Macros | null;
  overrides: Record<number, IngredientOverride>;
  vetoed: string[];
  kitchen: Kitchen;
}) {
  const saved = kitchen.isSaved(recipe.title, recipe.sourceUrl);
  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={() =>
        kitchen.save({
          title: recipe.title,
          sourceUrl: recipe.sourceUrl,
          imageUrl: recipe.imageUrl,
          servings: recipe.servings,
          lines: recipe.lines,
          overrides,
          vetoed,
          target,
          originalMacros:
            recipe.original.perServing ?? recipe.original.totals,
          adaptedMacros: recipe.adapted?.fittedMacros ?? null,
        })
      }
    >
      {saved ? <CheckIcon /> : <BookmarkIcon />}
      {saved ? "Saved to your kitchen" : "Save this recipe"}
    </button>
  );
}

/**
 * The saved list, with a before/after for each recipe.
 *
 * The comparison is the reason to keep them: what a recipe cost you as written
 * against what it costs after adapting is the app's whole argument, and it is
 * far more convincing across five recipes you chose than one.
 */
export function KitchenPanel({
  kitchen,
  onOpen,
  busy,
}: {
  kitchen: Kitchen;
  onOpen: (recipe: SavedRecipe) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!kitchen.hydrated || kitchen.recipes.length === 0) return null;

  return (
    <div className="kitchen card">
      <button
        type="button"
        className="kitchen-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sec-icon">
          <BookmarkIcon />
        </span>
        <span>
          <span className="kitchen-title">Your kitchen</span>
          <span className="kitchen-sub">
            {kitchen.recipes.length} saved recipe
            {kitchen.recipes.length === 1 ? "" : "s"}
          </span>
        </span>
      </button>

      {open && (
        <div className="kitchen-body">
          {kitchen.recipes.map((r) => (
            <div className="kitchen-row" key={r.id}>
              <div className="kitchen-name">{r.title}</div>
              {r.originalMacros && (
                <div className="kitchen-compare">
                  <span className="kitchen-before">
                    as written: {Math.round(r.originalMacros.calories)} cals ·{" "}
                    {Math.round(r.originalMacros.protein)}P ·{" "}
                    {Math.round(r.originalMacros.fat)}F
                  </span>
                  {r.adaptedMacros && (
                    <span className="kitchen-after">
                      adapted: {Math.round(r.adaptedMacros.calories)} cals ·{" "}
                      {Math.round(r.adaptedMacros.protein)}P ·{" "}
                      {Math.round(r.adaptedMacros.fat)}F
                    </span>
                  )}
                </div>
              )}
              <div className="kitchen-actions">
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={busy}
                  onClick={() => onOpen(r)}
                >
                  Re-adapt to my current targets
                </button>
                <button
                  type="button"
                  className="kitchen-remove"
                  onClick={() => kitchen.remove(r.id)}
                  aria-label={`Remove ${r.title}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
