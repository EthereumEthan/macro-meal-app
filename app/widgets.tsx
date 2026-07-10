"use client";

import { useEffect, useState } from "react";
import { Macros } from "@/lib/nutrition";
import { AISLE_ORDER, Aisle, categorize } from "@/lib/categories";

/* ---------------- Macro ring (donut) ---------------- */

// Categorical palette validated for the dark surface (CVD-safe, ≥3:1)
const RING_COLORS = {
  protein: "#3987e5",
  carbs: "#199e70",
  fat: "#c98500",
};

// 2px surface gap between touching segments, in circumference units
const RING_GAP = 3;

export function MacroRing({ macros }: { macros: Macros }) {
  const pCal = macros.protein * 4;
  const cCal = macros.carbs * 4;
  const fCal = macros.fat * 9;
  const total = pCal + cCal + fCal;

  const r = 54;
  const c = 2 * Math.PI * r;
  const segs =
    total > 0
      ? [
          { key: "protein", frac: pCal / total, color: RING_COLORS.protein },
          { key: "carbs", frac: cCal / total, color: RING_COLORS.carbs },
          { key: "fat", frac: fCal / total, color: RING_COLORS.fat },
        ]
      : [];

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
          strokeWidth="16"
        />
        {segs.map((s) => {
          const dash = s.frac * c;
          const visible = Math.max(dash - RING_GAP, 0);
          const offset = -(cumulative * c + RING_GAP / 2);
          cumulative += s.frac;
          return (
            <circle
              key={s.key}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="15"
              strokeDasharray={`${visible} ${c}`}
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
        <LegendItem
          color={RING_COLORS.protein}
          label="Protein"
          grams={macros.protein}
          pct={total > 0 ? (pCal / total) * 100 : 0}
        />
        <LegendItem
          color={RING_COLORS.carbs}
          label="Carbs"
          grams={macros.carbs}
          pct={total > 0 ? (cCal / total) * 100 : 0}
        />
        <LegendItem
          color={RING_COLORS.fat}
          label="Fat"
          grams={macros.fat}
          pct={total > 0 ? (fCal / total) * 100 : 0}
        />
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  grams,
  pct,
}: {
  color: string;
  label: string;
  grams: number;
  pct: number;
}) {
  return (
    <div className="legend-item">
      <span className="legend-dot" style={{ background: color }} />
      <span className="legend-label">{label}</span>
      <span className="legend-grams">{Math.round(grams)}g</span>
      <span className="legend-pct">{Math.round(pct)}%</span>
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
      ? "Great fit for your macros ✓"
      : badge === "close"
        ? "Close to your macros"
        : "Off your macro targets";

  return (
    <div className="fit-block">
      <div className={`fit-badge ${badge}`}>{badgeText}</div>
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

const AISLE_ICONS: Record<Aisle, string> = {
  Produce: "🥬",
  "Meat & Seafood": "🥩",
  "Dairy & Eggs": "🥛",
  "Bakery & Grains": "🍞",
  Frozen: "🧊",
  "Pantry & Canned": "🥫",
  Other: "🛒",
};

export function GroceryList({
  ingredients,
}: {
  ingredients: { text: string; price: number | null }[];
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const groups = new Map<Aisle, { text: string; price: number | null; idx: number }[]>();
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
      {AISLE_ORDER.filter((a) => groups.has(a)).map((aisle) => (
        <div className="grocery-section" key={aisle}>
          <div className="grocery-aisle">
            <span>{AISLE_ICONS[aisle]}</span>
            {aisle}
          </div>
          {groups.get(aisle)!.map((ing) => (
            <label
              className={checked.has(ing.idx) ? "grocery-item done" : "grocery-item"}
              key={ing.idx}
            >
              <input
                type="checkbox"
                checked={checked.has(ing.idx)}
                onChange={() => toggle(ing.idx)}
              />
              <span className="grocery-text">{ing.text}</span>
              {ing.price !== null && (
                <span className="grocery-price">~${ing.price.toFixed(2)}</span>
              )}
            </label>
          ))}
        </div>
      ))}
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
      className="add-day-btn"
      onClick={() => {
        onAdd(name, macros);
        setAdded(true);
        setTimeout(() => setAdded(false), 1800);
      }}
    >
      {added ? "Added to today ✓" : "+ Add to today's total"}
    </button>
  );
}

/* ---------------- Daily bar (top of page) ---------------- */

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

export function DailyBar({ log }: { log: DailyLog }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!log.hydrated) return null;

  const consumed = sumMeals(log.meals);
  const mealCount = log.meals.length;

  return (
    <div className="daily card">
      <div className="daily-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <strong>Today</strong>
          <span className="daily-summary">
            {Math.round(consumed.calories)} / {Math.round(log.goals.calories)}{" "}
            cals
            {mealCount > 0 &&
              ` · ${mealCount} meal${mealCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <span className="daily-toggle">{open ? "▲ hide" : "▼ show"}</span>
      </div>

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
                  <span>{m.label}</span>
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

          {log.meals.length > 0 && (
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
                    aria-label="Remove meal"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="daily-actions">
            <button
              type="button"
              className="daily-link"
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? "Done editing goals" : "Edit daily goals"}
            </button>
            {log.meals.length > 0 && (
              <button
                type="button"
                className="daily-link danger"
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
                  <label>
                    {m.label} {m.unit && `(${m.unit})`}
                  </label>
                  <input
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
