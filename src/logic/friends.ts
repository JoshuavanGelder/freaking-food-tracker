// Samenvatting van een vriend voor de vriendenlijst: vandaag, deze week, reeks en gewichtsverloop.
// Pure functies zonder runtime-imports (zie CLAUDE.md), getest in friends.test.ts.

export type DayTotal = { date: string; kcal: number; e: number; k: number; v: number; fiber: number; items: number };
export type Weight = { date: string; kg: number };

function shift(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type FriendSummary = {
  today: DayTotal | null;
  /** Deel van het dagdoel vandaag (0–∞), null zonder doel of zonder gegevens. */
  todayPct: number | null;
  /** Gemiddelde kcal over de gelogde dagen van de afgelopen 7 dagen (vandaag meegeteld). */
  weekAvg: number | null;
  loggedThisWeek: number;
  /** Aaneengesloten dagen met eten, tot en met vandaag (of gisteren als vandaag nog leeg is). */
  streak: number;
  latestKg: number | null;
  /** Verschil tussen het laatste gewicht en het gewicht van ~7 dagen eerder. */
  weekChangeKg: number | null;
};

export function summarizeFriend(days: DayTotal[], weights: Weight[], targetKcal: number | null, today: string): FriendSummary {
  const byDate = new Map(days.filter((d) => d.items > 0).map((d) => [d.date, d]));
  const t = byDate.get(today) ?? null;
  const week = Array.from({ length: 7 }, (_, i) => byDate.get(shift(today, -i))).filter((d): d is DayTotal => !!d);
  const weekAvg = week.length ? week.reduce((s, d) => s + d.kcal, 0) / week.length : null;

  let streak = 0;
  let d = byDate.has(today) ? today : shift(today, -1);
  while (byDate.has(d)) {
    streak++;
    d = shift(d, -1);
  }

  const ws = [...weights].filter((w) => w.kg > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const latest = ws.length ? ws[ws.length - 1] : null;
  let weekChangeKg: number | null = null;
  if (latest) {
    const ref = shift(latest.date, -7);
    // het gewicht dat het dichtst bij een week eerder ligt (tussen 4 en 14 dagen terug)
    const candidates = ws.filter((w) => w.date <= shift(latest.date, -4) && w.date >= shift(latest.date, -14));
    if (candidates.length) {
      const dist = (w: Weight) => Math.abs(Date.parse(w.date) - Date.parse(ref));
      const base = candidates.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      weekChangeKg = Math.round((latest.kg - base.kg) * 10) / 10;
    }
  }

  return {
    today: t,
    todayPct: t && targetKcal && targetKcal > 0 ? t.kcal / targetKcal : null,
    weekAvg: weekAvg != null ? Math.round(weekAvg) : null,
    loggedThisWeek: week.length,
    streak,
    latestKg: latest ? latest.kg : null,
    weekChangeKg,
  };
}

/** Vriendcode leesbaar maken: "a1b2c3d4" → "a1b2 c3d4". */
export function formatCode(code: string): string {
  const c = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

/** Invoer van een code opschonen; geldig = 8 tekens 0-9a-f. */
export function cleanCode(input: string): string | null {
  const c = input.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return /^[0-9a-f]{8}$/.test(c) ? c : null;
}

// ---------- favorieten van een vriend ----------
// Wat een vriend deelt komt uit zijn bibliotheek in de cloud; we controleren de vorm voordat de app het gebruikt.

import type { Food } from './off';

export type FriendFavMeal = { id: string; name: string; items: { food: Food; grams: number }[] };
export type FriendFavorites = { foods: Food[]; meals: FriendFavMeal[] };

const SOURCES = ['off', 'eigen', 'nevo'];
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Eén product uit de cloud; null als het er niet uitziet als een product. */
export function cleanFood(x: any): Food | null {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.id !== 'string' || !x.id || x.id.length > 80) return null;
  if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 160) return null;
  const per = x.per;
  if (!per || typeof per !== 'object' || !num(per.kcal) || per.kcal < 0 || per.kcal > 1000) return null;
  for (const k of ['e', 'k', 'v']) if (!num(per[k]) || per[k] < 0 || per[k] > 1000) return null;
  const f: Food = { ...x, per, source: SOURCES.includes(x.source) ? x.source : 'eigen' };
  if (f.brand != null && typeof f.brand !== 'string') delete f.brand;
  for (const k of ['servingG', 'packageG'] as const) if (f[k] != null && !(num(f[k]) && f[k]! > 0 && f[k]! < 100000)) delete f[k];
  if (f.servingLabel != null && typeof f.servingLabel !== 'string') delete f.servingLabel;
  if (f.unit != null && f.unit !== 'g' && f.unit !== 'ml') delete f.unit;
  return f;
}

/** Het antwoord van `friend_favorites` opschonen: kapotte of vreemde items vallen weg. */
export function parseFriendFavorites(raw: unknown): FriendFavorites {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { foods?: unknown; meals?: unknown };
  const foods = (Array.isArray(r.foods) ? r.foods : []).map(cleanFood).filter((f): f is Food => !!f);
  const meals: FriendFavMeal[] = [];
  for (const m of Array.isArray(r.meals) ? (r.meals as any[]) : []) {
    if (!m || typeof m.name !== 'string' || !m.name.trim() || !Array.isArray(m.items)) continue;
    const items = m.items
      .map((it: any) => ({ food: cleanFood(it?.food), grams: it?.grams }))
      .filter((it: { food: Food | null; grams: unknown }) => it.food && num(it.grams) && it.grams > 0 && it.grams < 100000) as { food: Food; grams: number }[];
    if (items.length) meals.push({ id: typeof m.id === 'string' ? m.id : m.name, name: m.name.trim().slice(0, 80), items });
  }
  return { foods, meals };
}

export const mealKcal = (items: { food: Food; grams: number }[]) => items.reduce((s, it) => s + (it.food.per.kcal * it.grams) / 100, 0);
