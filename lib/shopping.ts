/**
 * Merging several recipes into one shopping trip.
 *
 * A per-recipe ingredient list is the wrong unit at the store: cook three
 * meals in a week and you walk past the chicken three times, buying 200g each
 * visit. Consolidating on the food each line resolved to — not on its text —
 * is what lets "500 g chicken breast", "2 chicken breasts" and "1 lb chicken
 * breast" become one line on the list.
 *
 * Lines the nutrition table didn't recognize are deliberately never merged.
 * Two unmatched strings that look similar may be nothing of the sort, and a
 * wrongly merged item is worse at the store than a duplicated one.
 */

import type { Aisle } from "./categories";
import { AISLE_ORDER, categorize } from "./categories";
import { PRICE_PER_100G } from "./prices";

export interface ShoppingLine {
  text: string;
  grams: number | null;
  /** Nutrition-table key this line resolved to, when it resolved at all. */
  matchKey: string | null;
  /** True when the user removed this line from the recipe entirely. */
  excluded?: boolean;
}

export interface ShoppingSource {
  /** Recipe name, so each item can say what it's for. */
  meal: string;
  lines: ShoppingLine[];
  /** Batches to cook — 2 buys twice the ingredients. Defaults to 1. */
  scale?: number;
}

export interface ShoppingItem {
  id: string;
  label: string;
  aisle: Aisle;
  grams: number | null;
  /** Estimated cost at national-average prices, null when unpriceable. */
  price: number | null;
  /** Recipe names this item is needed for, in order, without repeats. */
  meals: string[];
  /** The original lines that folded into this item. */
  lines: string[];
  merged: boolean;
}

export interface ShoppingList {
  items: ShoppingItem[];
  total: number | null;
  /** Items whose weight or price couldn't be estimated. */
  unpriced: number;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "450 g", "1.2 kg" — grocery-shelf units rather than raw grams. */
export function formatGrams(grams: number | null): string {
  if (grams === null) return "as needed";
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 1)} kg`;
  return `${Math.round(grams)} g`;
}

/**
 * Fold every source recipe into one list, ordered the way a store is walked.
 *
 * Matched foods merge across recipes and carry a summed weight; unmatched
 * lines pass through untouched, keeping their original wording so the shopper
 * can still recognize them.
 */
export function consolidate(sources: ShoppingSource[]): ShoppingList {
  const byKey = new Map<string, ShoppingItem>();
  let unpriced = 0;
  let unmatchedCount = 0;

  for (const source of sources) {
    const scale = source.scale ?? 1;
    for (const line of source.lines) {
      // Seasonings stay on the list — you still have to own salt — but a line
      // the user struck out is one they aren't cooking with, so it isn't one
      // they need to buy.
      if (line.excluded) continue;
      const grams = line.grams === null ? null : line.grams * scale;
      const id = line.matchKey
        ? `food:${line.matchKey}`
        : `line:${unmatchedCount++}`;

      const existing = byKey.get(id);
      if (existing) {
        existing.grams =
          existing.grams === null || grams === null
            ? null
            : existing.grams + grams;
        if (!existing.meals.includes(source.meal)) {
          existing.meals.push(source.meal);
        }
        existing.lines.push(line.text);
        existing.merged = true;
        continue;
      }

      byKey.set(id, {
        id,
        label: line.matchKey ? titleCase(line.matchKey) : line.text,
        aisle: categorize(line.matchKey ?? line.text),
        grams,
        price: null,
        meals: [source.meal],
        lines: [line.text],
        merged: false,
      });
    }
  }

  const items = [...byKey.values()];
  for (const item of items) {
    const key = item.id.startsWith("food:") ? item.id.slice(5) : null;
    const per100g = key ? PRICE_PER_100G[key] : undefined;
    if (per100g !== undefined && item.grams !== null) {
      item.price = Math.round(((per100g * item.grams) / 100) * 100) / 100;
    } else {
      unpriced++;
    }
  }

  const order = new Map(AISLE_ORDER.map((a, i) => [a, i]));
  items.sort((a, b) => {
    const byAisle = (order.get(a.aisle) ?? 99) - (order.get(b.aisle) ?? 99);
    return byAisle !== 0 ? byAisle : a.label.localeCompare(b.label);
  });

  const priced = items.filter((i) => i.price !== null);
  return {
    items,
    total:
      priced.length > 0
        ? Math.round(priced.reduce((s, i) => s + (i.price ?? 0), 0) * 100) / 100
        : null,
    unpriced,
  };
}

/** Group a consolidated list by aisle, keeping store order and dropping empties. */
export function byAisle(items: ShoppingItem[]): [Aisle, ShoppingItem[]][] {
  const groups = new Map<Aisle, ShoppingItem[]>();
  for (const item of items) {
    const list = groups.get(item.aisle);
    if (list) list.push(item);
    else groups.set(item.aisle, [item]);
  }
  return AISLE_ORDER.filter((a) => groups.has(a)).map((a) => [
    a,
    groups.get(a)!,
  ]);
}

/**
 * The list as plain text, for pasting into Notes or a message.
 *
 * Deliberately plain: no table alignment, no markdown. It has to survive being
 * pasted into whatever the shopper actually keeps their list in.
 */
export function toPlainText(
  list: ShoppingList,
  opts: { title?: string; meals?: string[] } = {},
): string {
  const out: string[] = [];
  out.push(opts.title ?? "Shopping list");
  if (opts.meals?.length) out.push(`For: ${opts.meals.join(", ")}`);
  out.push("");

  for (const [aisle, items] of byAisle(list.items)) {
    out.push(`${aisle.toUpperCase()}`);
    for (const item of items) {
      const qty = formatGrams(item.grams);
      const price = item.price !== null ? `  ~$${item.price.toFixed(2)}` : "";
      out.push(`  [ ] ${item.label} — ${qty}${price}`);
    }
    out.push("");
  }

  if (list.total !== null) {
    out.push(`Estimated total: ~$${list.total.toFixed(2)}`);
    if (list.unpriced > 0) {
      out.push(
        `(${list.unpriced} item${list.unpriced === 1 ? "" : "s"} not priced)`,
      );
    }
  }
  out.push("Prices are national averages, not your store's.");
  return out.join("\n");
}
