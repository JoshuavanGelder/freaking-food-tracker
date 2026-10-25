// Zoeken in je eigen producten: recent, favorieten en zelfgemaakte (eigen) producten.
// Geen runtime-imports uit andere logic-bestanden (alleen types), zie CLAUDE.md; daarom staat norm() hier ook.

import type { Food } from './off';

/** Kleine letters, zonder accenten en leestekens (zelfde regels als bij het zoeken in NEVO). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export type MineSource = {
  foods: Record<string, Food>;
  recent: string[];
  favorites: string[];
};

/**
 * Producten uit recent, favorieten en eigen die bij de zoekopdracht passen.
 * Volgorde: recent (nieuwste eerst), dan favorieten, dan eigen producten. Elk product één keer.
 * Alle woorden uit de zoekopdracht moeten in naam of merk voorkomen.
 */
export function searchMine(src: MineSource, query: string, exclude: Set<string> = new Set(), limit = 20): Food[] {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length || norm(query).length < 2) return [];
  const own = Object.values(src.foods)
    .filter((f) => f.source === 'eigen')
    .map((f) => f.id);
  const seen = new Set<string>(exclude);
  const out: Food[] = [];
  for (const id of [...src.recent, ...src.favorites, ...own]) {
    if (seen.has(id) || id.startsWith('summary:')) continue;
    seen.add(id);
    const f = src.foods[id];
    if (!f) continue;
    const hay = ` ${norm(`${f.name} ${f.brand ?? ''}`)} `;
    if (!tokens.every((t) => hay.includes(t))) continue;
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Recent voor één maaltijd: producten die je eerder bij precies deze maaltijd hebt gelogd.
 * Nieuwste dag eerst (binnen een dag: laatst toegevoegd eerst), elk product één keer, dagtotalen van een import
 * (`summary:`) komen nooit mee. `foods` geeft de nieuwste versie van een product (bv. aangepaste keukenmaat).
 */
export function recentForMeal(
  log: { date: string; meal: string; food: Food }[],
  foods: Record<string, Food>,
  meal: string,
  limit = 40,
): Food[] {
  const sorted = log.filter((e) => e.meal === meal).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const seen = new Set<string>();
  const out: Food[] = [];
  for (let i = sorted.length - 1; i >= 0 && out.length < limit; i--) {
    const f = sorted[i].food;
    if (!f || seen.has(f.id) || f.id.startsWith('summary:')) continue;
    seen.add(f.id);
    out.push(foods[f.id] ?? f);
  }
  return out;
}
