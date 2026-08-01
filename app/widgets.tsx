"use client";

import { useEffect, useState } from "react";
import { Macros } from "@/lib/nutrition";
import { AISLE_ORDER, Aisle, categorize } from "@/lib/categories";
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "@/app/icons";

/* ---------------- Macro ring (donut) ---------------- */

// Hues live in CSS (--protein/--carbs/--fat) so light and dark each get a
// step validated against their own surface. Identity is never color-alone:
// the legend direct-labels every segment with name, grams and share.
const RING_SLOTS = [
  { key: "protein" as const, label: "Protein", color: "var(--protein)" },
  { key: "carbs" as const, label: "Carbs", color: "var(--carbs)" },
  { key: "fat" as const, label: "Fat", color: "var(--fat)" },
];

const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

// 2px surface gap between touching segments, in circumference units
const RING_GAP = 3.4;

export function MacroRing({ macros }: { macros: Macros }) {
  const cals = {
    protein: macros.protein * CAL_PER_G.protein,
    carbs: macros.carbs * CAL_PER_G.carbs,
    fat: macros.fat * CAL_PER_G.fat,
  };
  const total = cals.protein + cals.carbs + cals.fat;

  const r = 54;
  const c = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 140 140" className="ring-svg" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={r}
          className="ring-track"
          fill="none"
          strokeWidth="14"
        />
        {total > 0 &&
          RING_SLOTS.map((slot) => {
            const frac = cals[slot.key] / total;
            const dash = Math.max(frac * c - RING_GAP, 0);
            const offset = -(cumulative * c + RING_GAP / 2);
            cumulative += frac;
            return (
              <circle
                key={slot.key}
                className="ring-seg"
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={slot.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${c}`}
                strokeDashoffset={offset}
                transform="rotate(-90 70 70)"
              />
            );
          })}
      </svg>
      <div className="ring-center">
        <div className="ring-cals">{Math.round(macros.calories)}</div>
        <div className="ring-cals-label">cals</div>
      </div>
      <div className="ring-legend">
        {RING_SLOTS.map((slot) => (
          <div className="legend-item" key={slot.key}>
            <span className="legend-dot" style={{ background: slot.color }} />
            <span className="legend-label">{slot.label}</span>
            <span className="legend-grams">
              {Math.round(macros[slot.key])}g
            </span>
            <span className="legend-pct">
              {total > 0 ? Math.round((cals[slot.key] / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Fit bars (target vs actual) ---------------- */

type Fit = "on" | "close" | "off";

function fitOf(ratio: number): Fit {
  if (ratio >= 0.9 && ratio <= 1.1) return "on";
  if ((ratio >= 0.75 && ratio < 0.9) || (ratio > 1.1 && ratio <= 1.25))
    return "close";
  return "off";
}

const METRICS: { key: keyof Macros; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

export function FitBars({
  target,
  actual,
}: {
  target: Macros;
  actual: Macros;
}) {
  const rows = METRICS.map((m) => {
    const t = target[m.key];
    const a = actual[m.key];
    const ratio = t > 0 ? a / t : 1;
    return { ...m, t, a, ratio, fit: fitOf(ratio) };
  });

  const anyOff = rows.some((r) => r.fit === "off");
  const allOn = rows.every((r) => r.fit === "on");
  const badge: Fit = allOn ? "on" : anyOff ? "off" : "close";
  const badgeText =
    badge === "on"
      ? "Great fit for your macros"
      : badge === "close"
        ? "Close to your macros"
        : "Off your macro targets";

  return (
    <div className="fit-block">
      {/* icon + label, so the state never rides on color alone */}
      <div className={`fit-badge ${badge}`}>
        {badge === "on" ? <CheckCircleIcon /> : <AlertIcon />}
        {badgeText}
      </div>
      {rows.map((r) => (
        <div className="fit-row" key={r.key}>
          <span className="fit-label">{r.label}</span>
          <div className="fit-track">
            <div
              className={`fit-fill ${r.fit}`}
              style={{ width: `${Math.min(r.ratio, 1) * 100}%` }}
            />
          </div>
          <span className="fit-vals">
            {Math.round(r.a)}
            {r.unit} / {Math.round(r.t)}
            {r.unit}
            <span className="fit-pct"> ({Math.round(r.ratio * 100)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Grocery list by aisle ---------------- */

export function GroceryList({
  ingredients,
}: {
  ingredients: { text: string; price: number | null }[];
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const groups = new Map<
    Aisle,
    { text: string; price: number | null; idx: number }[]
  >();
  ingredients.forEach((ing, idx) => {
    const aisle = categorize(ing.text);
    if (!groups.has(aisle)) groups.set(aisle, []);
    groups.get(aisle)!.push({ ...ing, idx });
  });

  function toggle(idx: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="grocery">
      {AISLE_ORDER.filter((a) => groups.has(a)).map((aisle) => {
        const items = groups.get(aisle)!;
        const done = items.filter((i) => checked.has(i.idx)).length;
        return (
          <div className="grocery-section" key={aisle}>
            <div className="grocery-aisle">
              {aisle}
              <span className="grocery-count">
                {done}/{items.length}
              </span>
            </div>
            {items.map((ing) => (
              <label
                className={
                  checked.has(ing.idx) ? "grocery-item done" : "grocery-item"
                }
                key={ing.idx}
              >
                <input
                  type="checkbox"
                  checked={checked.has(ing.idx)}
                  onChange={() => toggle(ing.idx)}
                />
                <span className="grocery-text">{ing.text}</span>
                {ing.price !== null && (
                  <span className="grocery-price">
                    ~${ing.price.toFixed(2)}
                  </span>
                )}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Daily macro log (localStorage) ---------------- */

const STORAGE_KEY = "macrochef-daily";
const DEFAULT_GOALS: Macros = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
};

interface LoggedMeal {
  id: string;
  name: string;
  macros: Macros;
}

interface DayState {
  date: string;
  goals: Macros;
  meals: LoggedMeal[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

export function useDailyLog() {
  const [state, setState] = useState<DayState>({
    date: today(),
    goals: DEFAULT_GOALS,
    meals: [],
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DayState>;
        const goals = parsed.goals ?? DEFAULT_GOALS;
        if (parsed.date === today()) {
          setState({ date: today(), goals, meals: parsed.meals ?? [] });
        } else {
          // New day — keep goals, clear meals
          setState({ date: today(), goals, meals: [] });
        }
      }
    } catch {
      // corrupt storage — start fresh
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or blocked — non-fatal
    }
  }, [state, hydrated]);

  const addMeal = (name: string, macros: Macros) =>
    setState((s) => ({
      ...s,
      date: today(),
      meals: [...s.meals, { id: newId(), name, macros }],
    }));
  const removeMeal = (id: string) =>
    setState((s) => ({ ...s, meals: s.meals.filter((m) => m.id !== id) }));
  const clearDay = () => setState((s) => ({ ...s, meals: [] }));
  const setGoals = (goals: Macros) => setState((s) => ({ ...s, goals }));

  return { ...state, hydrated, addMeal, removeMeal, clearDay, setGoals };
}

export type DailyLog = ReturnType<typeof useDailyLog>;

/* ---------------- Add-to-today button ---------------- */

export function AddToDayButton({
  name,
  macros,
  onAdd,
}: {
  name: string;
  macros: Macros;
  onAdd: (name: string, macros: Macros) => void;
}) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline add-day-btn"
      onClick={() => {
        onAdd(name, macros);
        setAdded(true);
        setTimeout(() => setAdded(false), 1800);
      }}
    >
      {added ? <CheckIcon /> : <PlusIcon />}
      {added ? "Added to today" : "Add to today's total"}
    </button>
  );
}

/* ---------------- Daily bar ---------------- */

function sumMeals(meals: LoggedMeal[]): Macros {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.macros.calories,
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function DayRing({ pct, over }: { pct: number; over: boolean }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="daily-ring" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth="3.5"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={over ? "var(--bad)" : "var(--accent)"}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

export function DailyBar({ log }: { log: DailyLog }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!log.hydrated) return null;

  const consumed = sumMeals(log.meals);
  const mealCount = log.meals.length;
  const calPct =
    log.goals.calories > 0
      ? Math.min((consumed.calories / log.goals.calories) * 100, 100)
      : 0;

  return (
    <div className="daily card">
      <button
        type="button"
        className="daily-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <DayRing pct={calPct} over={consumed.calories > log.goals.calories} />
        <span>
          <span className="daily-title">Today</span>
          <span className="daily-summary">
            {Math.round(consumed.calories)} / {Math.round(log.goals.calories)}{" "}
            cals
            {mealCount > 0 &&
              ` · ${mealCount} meal${mealCount === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className={open ? "daily-toggle open" : "daily-toggle"}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div className="daily-body">
          {METRICS.map((m) => {
            const goal = log.goals[m.key];
            const have = consumed[m.key];
            const remaining = goal - have;
            const pct = goal > 0 ? Math.min(have / goal, 1) * 100 : 0;
            const over = remaining < 0;
            return (
              <div className="daily-metric" key={m.key}>
                <div className="daily-metric-top">
                  <span className="daily-metric-name">{m.label}</span>
                  <span className={over ? "daily-over" : "daily-left"}>
                    {over
                      ? `${Math.round(-remaining)}${m.unit} over`
                      : `${Math.round(remaining)}${m.unit} left`}
                  </span>
                </div>
                <div className="daily-track">
                  <div
                    className={over ? "daily-fill over" : "daily-fill"}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="daily-metric-nums">
                  {Math.round(have)}
                  {m.unit} / {Math.round(goal)}
                  {m.unit}
                </div>
              </div>
            );
          })}

          {log.meals.length > 0 ? (
            <div className="daily-meals">
              {log.meals.map((meal) => (
                <div className="daily-meal" key={meal.id}>
                  <span className="daily-meal-name">{meal.name}</span>
                  <span className="daily-meal-cals">
                    {Math.round(meal.macros.calories)} cals
                  </span>
                  <button
                    type="button"
                    className="daily-remove"
                    onClick={() => log.removeMeal(meal.id)}
                    aria-label={`Remove ${meal.name}`}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="daily-empty">
              Nothing logged yet — add a meal from any result below.
            </p>
          )}

          <div className="daily-actions">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? "Done editing goals" : "Edit daily goals"}
            </button>
            {log.meals.length > 0 && (
              <button
                type="button"
                className="btn-quiet danger"
                onClick={log.clearDay}
              >
                Clear today
              </button>
            )}
          </div>

          {editing && (
            <div className="daily-goals">
              {METRICS.map((m) => (
                <div key={m.key}>
                  <label htmlFor={`goal-${m.key}`}>
                    {m.label} {m.unit && `(${m.unit})`}
                  </label>
                  <input
                    id={`goal-${m.key}`}
                    type="number"
                    min="0"
                    value={log.goals[m.key]}
                    onChange={(e) =>
                      log.setGoals({
                        ...log.goals,
                        [m.key]: Number(e.target.value),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Theme toggle ---------------- */

const THEME_KEY = "macrochef-theme";

export function ThemeToggle() {
  // Rendered empty until mounted: the real theme lives on <html> (set by the
  // inline script in layout.tsx) and isn't knowable during SSR.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const stamped = document.documentElement.dataset.theme;
    setDark(
      stamped
        ? stamped === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // storage blocked — theme still applies for this page view
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark === null ? null : dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
