// Gegevens exporteren als JSON-bestand: "deze week" (de afgelopen 7 dagen, vandaag meegeteld) of alles.
// Pure functies, zonder React, zodat ze los te testen zijn (npm test).
// Geen runtime-imports uit andere logic-bestanden (alleen types), zie CLAUDE.md.

import type { Goals, Per100, Profile, WeightEntry } from './calc';
import type { Food } from './off';

export type ExportScope = 'week' | 'all';

export type ExportInput = {
  profile: Profile | null;
  goals: Goals;
  log: { date: string; meal: string; food: Food; grams: number }[];
  weights: WeightEntry[];
  foods: Record<string, Food>;
  favorites: string[];
  favMeals: { name: string; items: { food: Food; grams: number }[] }[];
};

const MEAL_ORDER = ['ontbijt', 'lunch', 'diner', 'snacks'];

export const EXPORT_NOTE =
  'Waarden gelden voor de gelogde hoeveelheid. Wat een product niet heeft (bijv. vezels of vitamines van een merkproduct) ' +
  'ontbreekt; dagtotalen tellen alleen de bekende waarden. Basisproducten: gegevens van NEVO-online (RIVM, Bilthoven); ' +
  'merkproducten: Open Food Facts (ODbL).';

function round(x: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Optelsom van datums zonder tijdzone-gedoe ('YYYY-MM-DD' + n dagen). */
export function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Eerste en laatste dag van de export; null als er bij 'alles' niets is om te exporteren. */
export function exportRange(scope: ExportScope, today: string, input: Pick<ExportInput, 'log' | 'weights'>): { from: string; to: string } | null {
  if (scope === 'week') return { from: shiftDay(today, -6), to: today };
  const dates = [...input.log.map((e) => e.date), ...input.weights.map((w) => w.date)].sort();
  if (!dates.length) return null;
  return { from: dates[0], to: today > dates[dates.length - 1] ? today : dates[dates.length - 1] };
}

type Amounts = Omit<Per100, 'micro'> & { micro?: Record<string, number> };

/** Voedingswaarden van `grams` van een product, afgerond; ontbrekende waarden blijven weg. */
function amounts(per: Per100, grams: number): Amounts {
  const f = grams / 100;
  const out: Amounts = { kcal: round(per.kcal * f), e: round(per.e * f), k: round(per.k * f), v: round(per.v * f) };
  if (per.fiber != null) out.fiber = round(per.fiber * f);
  if (per.salt != null) out.salt = round(per.salt * f, 2);
  if (per.satFat != null) out.satFat = round(per.satFat * f);
  if (per.sugar != null) out.sugar = round(per.sugar * f);
  if (per.micro) {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(per.micro)) if (v != null) m[k] = round(v * f, 2);
    if (Object.keys(m).length) out.micro = m;
  }
  return out;
}

function addTo(total: Amounts, a: Amounts) {
  total.kcal += a.kcal;
  total.e += a.e;
  total.k += a.k;
  total.v += a.v;
  for (const key of ['fiber', 'salt', 'satFat', 'sugar'] as const) {
    if (a[key] != null) total[key] = (total[key] ?? 0) + a[key]!;
  }
  if (a.micro) {
    const m = (total.micro ??= {});
    for (const [k, v] of Object.entries(a.micro)) m[k] = (m[k] ?? 0) + v;
  }
}

function roundAmounts(a: Amounts): Amounts {
  const out: Amounts = { kcal: round(a.kcal), e: round(a.e), k: round(a.k), v: round(a.v) };
  if (a.fiber != null) out.fiber = round(a.fiber);
  if (a.salt != null) out.salt = round(a.salt, 2);
  if (a.satFat != null) out.satFat = round(a.satFat);
  if (a.sugar != null) out.sugar = round(a.sugar);
  if (a.micro) {
    out.micro = {};
    for (const [k, v] of Object.entries(a.micro)) out.micro[k] = round(v, 2);
  }
  return out;
}

function foodSummary(f: Food) {
  return { id: f.id, name: f.name, ...(f.brand ? { brand: f.brand } : {}), unit: f.unit ?? 'g', per100: f.per, ...(f.servingG ? { servingG: f.servingG } : {}) };
}

/**
 * `backup`: de volledige app-state. Gaat alleen mee bij 'alles' en maakt terugzetten mogelijk
 * (Doelen → Gegevens → Importeren of terugzetten, zie backup.ts).
 */
export function buildExport(scope: ExportScope, today: string, now: string, input: ExportInput, backup?: unknown) {
  const range = exportRange(scope, today, input) ?? { from: today, to: today };
  const inRange = (d: string) => d >= range.from && d <= range.to;

  const byDay = new Map<string, ExportInput['log']>();
  for (const e of input.log) {
    if (!inRange(e.date)) continue;
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  // Bij 'week' staan alle 7 dagen erin (ook lege), bij 'alles' alleen dagen met eten.
  const dates: string[] = [];
  if (scope === 'week') for (let d = range.from; d <= range.to; d = shiftDay(d, 1)) dates.push(d);
  else dates.push(...[...byDay.keys()].sort());

  const days = dates.map((date) => {
    const entries = (byDay.get(date) ?? [])
      .map((e, i) => ({ e, i }))
      .sort((a, b) => MEAL_ORDER.indexOf(a.e.meal) - MEAL_ORDER.indexOf(b.e.meal) || a.i - b.i)
      .map(({ e }) => {
        const summary = e.food.id.startsWith('summary:');
        return {
          meal: e.meal,
          name: e.food.name,
          ...(e.food.brand ? { brand: e.food.brand } : {}),
          amount: round(e.grams),
          unit: e.food.unit ?? 'g',
          ...amounts(e.food.per, e.grams),
          ...(summary ? { summary: true } : {}),
        };
      });
    const total: Amounts = { kcal: 0, e: 0, k: 0, v: 0 };
    for (const en of entries) addTo(total, en);
    return { date, logged: entries.length > 0, totals: roundAmounts(total), entries };
  });

  const weights = [...input.weights]
    .filter((w) => inRange(w.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((w) => ({ date: w.date, kg: w.kg }));

  const out: Record<string, unknown> = {
    type: 'fft-export',
    v: 1,
    scope,
    exportedAt: now,
    from: range.from,
    to: range.to,
    note: EXPORT_NOTE,
    profile: input.profile,
    goals: input.goals,
    days,
    weights,
  };

  if (scope === 'all') {
    out.ownProducts = Object.values(input.foods)
      .filter((f) => f.source === 'eigen' && !f.id.startsWith('summary:'))
      .map(foodSummary);
    out.favoriteProducts = input.favorites.map((id) => input.foods[id]).filter(Boolean).map(foodSummary);
    out.favoriteMeals = input.favMeals.map((m) => ({
      name: m.name,
      items: m.items.map((i) => ({ name: i.food.name, amount: round(i.grams), unit: i.food.unit ?? 'g', ...amounts(i.food.per, i.grams) })),
    }));
    if (backup != null) out.backup = backup;
  }
  return out;
}

export function exportToText(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

export function exportFileName(scope: ExportScope, today: string, from: string): string {
  return scope === 'week' ? `freaking-food-tracker-week-${from}_${today}.json` : `freaking-food-tracker-alles-${today}.json`;
}
