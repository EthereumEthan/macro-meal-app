import { NextRequest, NextResponse } from "next/server";
import { isValidTarget } from "@/lib/fit";
import {
  buildRecipeResult,
  parseOverrides,
  parsePastedLines,
  parseVetoed,
} from "@/lib/recipe";

export const maxDuration = 60;

/**
 * Adapt a recipe the caller already holds the ingredient lines for.
 *
 * This is the endpoint behind three things that look unrelated on the page and
 * are the same request underneath: a list pasted in by hand, a hand-corrected
 * ingredient table, and a swap the user vetoed. Each is "these lines, this
 * target, these adjustments" — no page to fetch, no search to run, so it
 * answers fast enough to re-run on every edit.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lines = Array.isArray(body.lines)
    ? body.lines.filter((l): l is string => typeof l === "string")
    : typeof body.text === "string"
      ? parsePastedLines(body.text)
      : [];

  if (lines.length === 0) {
    return NextResponse.json(
      {
        error:
          "Paste the ingredient list — one ingredient per line, with amounts (e.g. \"2 cups heavy cream\").",
      },
      { status: 400 },
    );
  }

  const servingsRaw = Number(body.servings);
  const servings =
    Number.isFinite(servingsRaw) && servingsRaw > 0
      ? Math.round(servingsRaw)
      : null;

  const target = isValidTarget(body.macros) ? body.macros : null;

  const result = await buildRecipeResult(
    {
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Your recipe",
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      servings,
      lines,
      instructions: Array.isArray(body.instructions)
        ? body.instructions.filter((s): s is string => typeof s === "string")
        : [],
    },
    target,
    {
      overrides: parseOverrides(body.overrides),
      vetoed: parseVetoed(body.vetoed),
      // A re-adaptation is the same lines as a moment ago. The external
      // lookups already ran and their results are cached in-process, so
      // re-running them would only add latency to every keystroke.
      skipEnrichment: body.skipEnrichment === true,
    },
  );

  if (result.coverage.matched === 0) {
    return NextResponse.json(
      {
        error:
          "None of those lines looked like ingredients with amounts. Try one per line, like \"400 g chicken breast\" or \"1 cup heavy cream\".",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ recipe: { ...result, lines } });
}
