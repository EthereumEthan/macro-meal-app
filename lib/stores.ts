/**
 * Finding big-box grocery stores near a location, via OpenStreetMap.
 *
 * Nominatim (geocoding) and Overpass (map queries) are volunteer-run and free.
 * Both ask clients to identify themselves and to cache aggressively rather
 * than re-asking, which is what the User-Agent and the revalidate windows
 * below are for. Every failure is soft: no stores is a worse answer than some
 * stores, but it is a much better one than a broken page.
 */

import { matchChain } from "./prices";
import { USER_AGENT } from "./mealdb";

export interface Coords {
  lat: number;
  lon: number;
}

export interface Store {
  name: string;
  area: string;
  carries: string;
  /** Chain price level vs national average, used to estimate basket cost. */
  multiplier: number;
}

export async function geocode(location: string): Promise<Coords | null> {
  const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(location)}`,
    {
      headers: { "User-Agent": USER_AGENT },
      // "Austin, TX" resolves to the same point every time, and Nominatim's
      // policy asks clients to cache rather than re-ask.
      next: { revalidate: 2592000 },
    },
  );
  if (!geoRes.ok) {
    console.error("Nominatim error:", geoRes.status, await geoRes.text());
    return null;
  }
  const geo = await geoRes.json();
  if (!Array.isArray(geo) || geo.length === 0) {
    console.error("Nominatim: no results for", location);
    return null;
  }
  return { lat: parseFloat(geo[0].lat), lon: parseFloat(geo[0].lon) };
}

export async function findStores(
  coords: Coords | undefined,
  location: string | undefined,
): Promise<Store[]> {
  try {
    const point = coords ?? (location ? await geocode(location) : null);
    if (!point) return [];

    // Round the centre to ~1km before building the query. The search radius is
    // 15km, so this doesn't change which stores come back, but it collapses
    // every user in a neighbourhood onto one cache key instead of one per GPS
    // reading.
    const lat = point.lat.toFixed(2);
    const lon = point.lon.toFixed(2);

    // Big-box stores are sparser than corner supermarkets — search ~15km.
    // Target is often tagged department_store, Costco/Sam's as wholesale.
    const query = `[out:json][timeout:20];nwr["shop"~"supermarket|department_store|wholesale"]["name"](around:15000,${lat},${lon});out center 60;`;
    // GET rather than POST so Next's data cache can serve repeats: Overpass is
    // volunteer-run infrastructure and asks clients not to re-query the same
    // area. Store locations move on the order of months.
    const overpassRes = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 86400 },
      },
    );
    if (!overpassRes.ok) {
      console.error(
        "Overpass error:",
        overpassRes.status,
        await overpassRes.text(),
      );
      return [];
    }
    const data = await overpassRes.json();

    const seenChains = new Set<string>();
    const stores: Store[] = [];
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name: string | undefined = tags.name;
      if (!name) continue;
      const chain = matchChain(name);
      if (!chain || seenChains.has(chain.label)) continue;
      seenChains.add(chain.label);
      const parts = [
        tags["addr:housenumber"] && tags["addr:street"]
          ? `${tags["addr:housenumber"]} ${tags["addr:street"]}`
          : tags["addr:street"],
        tags["addr:city"],
      ].filter(Boolean);
      stores.push({
        name: chain.label,
        area: parts.length > 0 ? parts.join(", ") : "near you",
        carries:
          chain.multiplier >= 1.15
            ? "Pricier, but great for specialty swaps like chickpea pasta and organic produce"
            : chain.multiplier <= 0.9
              ? "Usually the cheapest option for staples and proteins"
              : "Full grocery selection — should cover every ingredient on the list",
        multiplier: chain.multiplier,
      });
      if (stores.length >= 6) break;
    }
    return stores;
  } catch (err) {
    console.error("findStores failed:", err);
    return [];
  }
}

/**
 * Price one basket at each nearby chain, or explain the absence of any.
 *
 * The fallback row is a real answer rather than an empty state: OpenStreetMap
 * coverage is patchy outside cities, and "we didn't find one" shouldn't read
 * as "there isn't one".
 */
export function storeEstimates(
  stores: Store[],
  basketCost: number | null,
  location: string | undefined,
) {
  if (stores.length === 0) {
    return [
      {
        name: "No big retail stores found nearby",
        area: location ?? "your area",
        carries:
          "Search Google Maps for Walmart, Target, H-E-B, or Kroger near you — any of them will carry these ingredients.",
        estCost: basketCost,
      },
    ];
  }
  return stores.map((s) => ({
    name: s.name,
    area: s.area,
    carries: s.carries,
    estCost:
      basketCost === null
        ? null
        : Math.round(basketCost * s.multiplier * 100) / 100,
  }));
}
