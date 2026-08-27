/**
 * Generating candidate ingredient substitutions.
 *
 * Two sources feed the same pipeline. The hand-written rules in
 * SWAP_RULES carry an editorial reason and cover the swaps a cook would
 * actually recognize. The family table (FOOD_FAMILY) covers everything else:
 * any listed ingredient can be traded for another member of its culinary
 * family, with a reason generated from the macro difference.
 *
 * Neither source decides anything. Both only *propose*; lib/adapt.ts scores
 * every proposal against the user's target and keeps the ones that help.
 */

import type { Macros, SwapRule } from "./nutrition";
import {
  SWAP_RULES,
  familyAlternatives,
  foodMacros,
  lookupNutrition,
} from "./nutrition";

export interface SwapCandidate {
  /** Stable across re-adaptation, so the UI can veto one by id. */
  id: string;
  ingredientIndex: number;
  /** The ingredient line rewritten with the substitution applied. */
  text: string;
  fromKey: string;
  toKey: string;
  /** Display name of the replacement ("Nonfat Greek yogurt", "quinoa"). */
  label: string;
  reason: string;
  source: "rule" | "family";
}

/**
 * Rewrite one ingredient line in place: "1 cup heavy cream, divided" with the
 * heavy-cream rule becomes "1 cup evaporated milk, divided". The replacement
 * keeps its capitalization only at the start of the line, so it doesn't read
 * as a proper noun mid-sentence.
 */
export function applySwap(text: string, rule: SwapRule): string | null {
  const match = text.match(rule.pattern);
  if (match?.index === undefined) return null;
  const replacement =
    match.index === 0
      ? rule.replacement
      : rule.replacement.charAt(0).toLowerCase() + rule.replacement.slice(1);
  return text.replace(rule.pattern, replacement);
}

/** Replace the matched food term inside a line, keeping the rest intact. */
function substituteTerm(
  text: string,
  fromKey: string,
  toKey: string,
): string | null {
  const idx = text.toLowerCase().indexOf(fromKey);
  if (idx === -1) return null;
  const replacement =
    idx === 0 ? toKey.charAt(0).toUpperCase() + toKey.slice(1) : toKey;
  return text.slice(0, idx) + replacement + text.slice(idx + fromKey.length);
}

const MACRO_LABEL: Record<keyof Macros, string> = {
  calories: "calories",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
};

/**
 * Describe a family swap in the terms a cook cares about: what moves most.
 *
 * Reports the calorie change plus the single macro that shifts hardest, both
 * per 100g, which is the unit the comparison is actually true in — the line's
 * own weight then scales it. A generated sentence is thinner than the curated
 * ones on SWAP_RULES, but it is never wrong about the direction.
 */
export function describeSwap(fromKey: string, toKey: string): string {
  const from = foodMacros(fromKey);
  const to = foodMacros(toKey);
  if (!from || !to) return `Swapped ${fromKey} for ${toKey}.`;

  const gramKeys: (keyof Macros)[] = ["protein", "carbs", "fat"];
  let biggest: keyof Macros = "protein";
  let biggestDelta = 0;
  for (const k of gramKeys) {
    const d = to[k] - from[k];
    if (Math.abs(d) > Math.abs(biggestDelta)) {
      biggest = k;
      biggestDelta = d;
    }
  }

  const calDelta = Math.round(to.calories - from.calories);
  const parts: string[] = [];
  if (Math.abs(calDelta) >= 5) {
    parts.push(
      `${calDelta < 0 ? "saves" : "adds"} ${Math.abs(calDelta)} calories`,
    );
  }
  if (Math.abs(biggestDelta) >= 1) {
    parts.push(
      `${biggestDelta < 0 ? "drops" : "adds"} ${Math.abs(Math.round(biggestDelta))}g ${MACRO_LABEL[biggest]}`,
    );
  }
  if (parts.length === 0) return `A near-identical stand-in for ${fromKey}.`;
  return `Per 100g, ${parts.join(" and ")} versus ${fromKey}.`;
}

/**
 * Every substitution worth *considering* for one ingredient line.
 *
 * Rules come first and win ties: when a rule and the family table both propose
 * the same replacement, the rule's hand-written reason is the better copy.
 * Only the first matching rule per line is offered, mirroring the precedence
 * the swap rules have always had.
 */
export function candidatesFor(
  text: string,
  ingredientIndex: number,
): SwapCandidate[] {
  const hit = lookupNutrition(text);
  if (!hit) return [];
  // Runtime (USDA) foods have no family and no rules keyed to them.
  if (hit.source === "external") return [];

  const out: SwapCandidate[] = [];
  const seen = new Set<string>();

  for (const rule of SWAP_RULES) {
    const rewritten = applySwap(text, rule);
    if (rewritten === null) continue;
    const after = lookupNutrition(rewritten);
    if (after && after.key !== hit.key) {
      out.push({
        id: `${ingredientIndex}|${after.key}`,
        ingredientIndex,
        text: rewritten,
        fromKey: hit.key,
        toKey: after.key,
        label: rule.replacement,
        reason: rule.reason,
        source: "rule",
      });
      seen.add(after.key);
    }
    // First matching rule wins for a given line, whether or not it helps.
    break;
  }

  for (const alt of familyAlternatives(hit.key)) {
    if (seen.has(alt)) continue;
    const rewritten = substituteTerm(text, hit.key, alt);
    if (rewritten === null) continue;
    // The rewrite has to actually read as the new food. If longest-wins
    // resolves it back to something else, the line was too tangled to touch.
    if (lookupNutrition(rewritten)?.key !== alt) continue;
    out.push({
      id: `${ingredientIndex}|${alt}`,
      ingredientIndex,
      text: rewritten,
      fromKey: hit.key,
      toKey: alt,
      label: alt,
      reason: describeSwap(hit.key, alt),
      source: "family",
    });
    seen.add(alt);
  }

  return out;
}
