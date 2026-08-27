/**
 * Turning body stats and a goal into macro targets.
 *
 * The hardest step in the app is the first one: four numbers most people
 * don't know. This module produces them from things they do know — height,
 * weight, age, how much they move, and what they're trying to do — using
 * Mifflin-St Jeor, the equation with the best track record for resting
 * metabolic rate in people without a body-composition scan.
 *
 * Everything here is an estimate for a healthy adult sizing a meal, not
 * clinical advice. Real energy needs vary by roughly +/-10% between two people
 * with identical stats, so these are a starting point to adjust from.
 */

import type { Macros } from "./nutrition";

export type Sex = "male" | "female";

export interface BodyStats {
  sex: Sex;
  /** Years. */
  age: number;
  /** Kilograms. */
  weightKg: number;
  /** Centimetres. */
  heightCm: number;
  activity: ActivityLevel;
}

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "athlete";

export const ACTIVITY_LEVELS: {
  key: ActivityLevel;
  label: string;
  detail: string;
  multiplier: number;
}[] = [
  {
    key: "sedentary",
    label: "Sedentary",
    detail: "Desk job, little deliberate exercise",
    multiplier: 1.2,
  },
  {
    key: "light",
    label: "Lightly active",
    detail: "Light exercise 1-3 days a week",
    multiplier: 1.375,
  },
  {
    key: "moderate",
    label: "Moderately active",
    detail: "Moderate exercise 3-5 days a week",
    multiplier: 1.55,
  },
  {
    key: "active",
    label: "Very active",
    detail: "Hard exercise 6-7 days a week",
    multiplier: 1.725,
  },
  {
    key: "athlete",
    label: "Athlete",
    detail: "Twice-daily training or a physical job on top of it",
    multiplier: 1.9,
  },
];

export type GoalKey =
  | "cut"
  | "lean-cut"
  | "maintain"
  | "lean-gain"
  | "gain";

/**
 * Calorie adjustments as a share of maintenance rather than a flat number, so
 * they scale with body size: 500 calories is a hard cut for a small person and
 * a gentle one for a large one.
 */
export const GOALS: {
  key: GoalKey;
  label: string;
  detail: string;
  adjust: number;
}[] = [
  {
    key: "cut",
    label: "Lose weight",
    detail: "20% below maintenance — roughly 0.5-1 lb a week",
    adjust: -0.2,
  },
  {
    key: "lean-cut",
    label: "Lose slowly",
    detail: "10% below maintenance, easier to hold on to muscle",
    adjust: -0.1,
  },
  {
    key: "maintain",
    label: "Maintain",
    detail: "Eat at maintenance",
    adjust: 0,
  },
  {
    key: "lean-gain",
    label: "Build slowly",
    detail: "10% above maintenance, minimising fat gain",
    adjust: 0.1,
  },
  {
    key: "gain",
    label: "Gain weight",
    detail: "20% above maintenance",
    adjust: 0.2,
  },
];

export type PresetKey =
  | "balanced"
  | "high-protein"
  | "keto"
  | "low-carb"
  | "high-carb";

/**
 * Macro splits as a share of calories. `proteinFloorPerKg` is the part that
 * matters most in a deficit: a percentage split alone can put protein under
 * what it takes to hold muscle, so each preset carries a floor in grams per
 * kilogram of bodyweight and the higher of the two wins.
 */
export const PRESETS: {
  key: PresetKey;
  label: string;
  detail: string;
  protein: number;
  carbs: number;
  fat: number;
  proteinFloorPerKg: number;
}[] = [
  {
    key: "balanced",
    label: "Balanced",
    detail: "30% protein, 40% carbs, 30% fat — a sane default",
    protein: 0.3,
    carbs: 0.4,
    fat: 0.3,
    proteinFloorPerKg: 1.6,
  },
  {
    key: "high-protein",
    label: "High protein",
    detail: "40% protein — for a cut, or training hard",
    protein: 0.4,
    carbs: 0.35,
    fat: 0.25,
    proteinFloorPerKg: 2,
  },
  {
    key: "keto",
    label: "Keto",
    detail: "Carbs near zero, fat carries the calories",
    protein: 0.25,
    carbs: 0.05,
    fat: 0.7,
    proteinFloorPerKg: 1.4,
  },
  {
    key: "low-carb",
    label: "Low carb",
    detail: "20% carbs, without going full keto",
    protein: 0.35,
    carbs: 0.2,
    fat: 0.45,
    proteinFloorPerKg: 1.8,
  },
  {
    key: "high-carb",
    label: "High carb",
    detail: "55% carbs — endurance training, or a big training day",
    protein: 0.25,
    carbs: 0.55,
    fat: 0.2,
    proteinFloorPerKg: 1.6,
  },
];

const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

/** Resting metabolic rate, Mifflin-St Jeor. */
export function bmr(stats: BodyStats): number {
  const base =
    10 * stats.weightKg + 6.25 * stats.heightCm - 5 * stats.age;
  return stats.sex === "male" ? base + 5 : base - 161;
}

/** Maintenance calories: resting rate scaled by how much the person moves. */
export function tdee(stats: BodyStats): number {
  const level =
    ACTIVITY_LEVELS.find((a) => a.key === stats.activity) ??
    ACTIVITY_LEVELS[0];
  return bmr(stats) * level.multiplier;
}

export interface TargetResult {
  bmr: number;
  maintenance: number;
  /** Daily macros for the chosen goal and split. */
  daily: Macros;
  /** The same target divided across the day's meals. */
  perMeal: Macros;
  /** True when the preset's percentage split was raised to hit the floor. */
  proteinFloorApplied: boolean;
}

/**
 * Daily and per-meal macro targets.
 *
 * Protein is settled first, because it is the macro with a real minimum. It
 * takes the larger of the preset's percentage and its grams-per-kilogram
 * floor; when the floor wins, the extra calories come out of carbs and fat in
 * proportion to their share of the split, so a keto plan stays keto.
 */
export function computeTargets(
  stats: BodyStats,
  goal: GoalKey,
  preset: PresetKey,
  mealsPerDay: number,
): TargetResult {
  const maintenance = tdee(stats);
  const goalDef = GOALS.find((g) => g.key === goal) ?? GOALS[2];
  const split = PRESETS.find((p) => p.key === preset) ?? PRESETS[0];
  const calories = maintenance * (1 + goalDef.adjust);

  const proteinFromSplit = (calories * split.protein) / CAL_PER_G.protein;
  const proteinFloor = split.proteinFloorPerKg * stats.weightKg;
  const protein = Math.max(proteinFromSplit, proteinFloor);
  const proteinFloorApplied = proteinFloor > proteinFromSplit + 0.5;

  // Whatever protein didn't claim, shared out in the split's own proportions.
  const remaining = Math.max(calories - protein * CAL_PER_G.protein, 0);
  const rest = split.carbs + split.fat;
  const carbCals = rest > 0 ? (remaining * split.carbs) / rest : 0;
  const fatCals = rest > 0 ? (remaining * split.fat) / rest : 0;

  const daily: Macros = {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbCals / CAL_PER_G.carbs),
    fat: Math.round(fatCals / CAL_PER_G.fat),
  };
  const meals = Math.max(1, Math.round(mealsPerDay));

  return {
    bmr: Math.round(bmr(stats)),
    maintenance: Math.round(maintenance),
    daily,
    perMeal: {
      calories: Math.round(daily.calories / meals),
      protein: Math.round(daily.protein / meals),
      carbs: Math.round(daily.carbs / meals),
      fat: Math.round(daily.fat / meals),
    },
    proteinFloorApplied,
  };
}

/* ---------- Unit helpers, for the imperial-first UI ---------- */

export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const inToCm = (inches: number) => inches * 2.54;
export const cmToIn = (cm: number) => cm / 2.54;

/** Feet and inches to centimetres, the way a height gets typed in the US. */
export function feetInchesToCm(feet: number, inches: number): number {
  return inToCm(feet * 12 + inches);
}
