// Dagen vooruit vullen en een standaard per weekdag.
//
// - Een standaard hoort bij een weekdag (zondag = 0 ... zaterdag = 6) en bevat producten per maaltijd.
// - Is er voor een weekdag geen standaard, dan wordt de dag van een week eerder voorgesteld.
// - Een standaard of voorstel wordt NOOIT vanzelf toegepast: per dag moet je het zelf accepteren (of overslaan).
//   `done` bevat de dagen waarvoor je al gekozen hebt, zodat het voorstel niet terugkomt.
//
// Pure functies zonder runtime-imports uit andere logic-bestanden (alleen types), zie CLAUDE.md.

import type { Food } from './off';

export type MealKey = 'ontbijt' | 'lunch' | 'diner' | 'snacks';
export type DefaultItem = { meal: MealKey; food: Food; grams: number };
/** Sleutel = weekdag als tekst ('0' t/m '6', zondag = 0). */
export type WeekdayDefaults = Record<string, DefaultItem[]>;
type LogLike = { date: string; meal: MealKey; food: Food; grams: number };

/** Hoeveel dagen vooruit je mag vullen (vandaag + 2 = overmorgen). */
export const DAYS_AHEAD = 2;
const DONE_KEEP_DAYS = 120;

const NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

function parse(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function shiftDay(key: string, n: number): string {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekdayOf(key: string): number {
  return parse(key).getDay();
}

export function weekdayName(key: string): string {
  return NAMES[weekdayOf(key)];
}

const clean = (e: { meal: MealKey; food: Food; grams: number }): DefaultItem => ({ meal: e.meal, food: e.food, grams: e.grams });

export function kcalOf(items: { food: Food; grams: number }[]): number {
  return items.reduce((s, i) => s + (i.food.per.kcal * i.grams) / 100, 0);
}

export type Suggestion = {
  /** 'default' = jouw standaard voor deze weekdag; 'lastWeek' = dezelfde dag een week eerder. */
  source: 'default' | 'lastWeek';
  items: DefaultItem[];
  /** Bij 'lastWeek': de datum waar het voorstel vandaan komt. */
  from?: string;
};

/** Wat er voor deze dag voorgesteld wordt: eerst jouw standaard, anders de dag van vorige week. */
export function suggestionFor(day: string, log: LogLike[], defaults: WeekdayDefaults | undefined): Suggestion | null {
  const own = defaults?.[String(weekdayOf(day))];
  if (own && own.length) return { source: 'default', items: own };
  const from = shiftDay(day, -7);
  const items = log.filter((e) => e.date === from).map(clean);
  return items.length ? { source: 'lastWeek', items, from } : null;
}

/** Alleen maaltijden die op deze dag nog leeg zijn worden aangevuld; wat je al hebt gelogd blijft ongemoeid. */
export function itemsToAdd(items: DefaultItem[], dayEntries: { meal: MealKey }[]): DefaultItem[] {
  const filled = new Set(dayEntries.map((e) => e.meal));
  return items.filter((i) => !filled.has(i.meal));
}

export type Offer = { source: Suggestion['source']; from?: string; items: DefaultItem[] };

/** Het voorstel dat je op deze dag te zien krijgt, of null (geen voorstel, niets aan te vullen of al beslist). */
export function offerFor(day: string, log: LogLike[], defaults: WeekdayDefaults | undefined, done: string[] | undefined): Offer | null {
  if (done?.includes(day)) return null;
  const s = suggestionFor(day, log, defaults);
  if (!s) return null;
  const items = itemsToAdd(s.items, log.filter((e) => e.date === day));
  return items.length ? { source: s.source, from: s.from, items } : null;
}

/** De huidige inhoud van een dag, als nieuwe standaard. */
export function defaultFromDay(day: string, log: LogLike[]): DefaultItem[] {
  return log.filter((e) => e.date === day).map(clean);
}

/** Onthoudt dat voor deze dag gekozen is (overnemen of overslaan); oude dagen worden opgeruimd. */
export function markDone(done: string[] | undefined, day: string, today: string): string[] {
  const oldest = shiftDay(today, -DONE_KEEP_DAYS);
  const next = (done ?? []).filter((d) => d >= oldest && d !== day);
  next.push(day);
  return next;
}

/** Controleert wat uit de cloud of een reservekopie komt. */
export function parseDefaults(raw: unknown): WeekdayDefaults {
  const out: WeekdayDefaults = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(v)) continue;
    const items = v.filter(
      (i: any): i is DefaultItem =>
        !!i &&
        ['ontbijt', 'lunch', 'diner', 'snacks'].includes(i.meal) &&
        !!i.food &&
        typeof i.food.id === 'string' &&
        typeof i.food.name === 'string' &&
        !!i.food.per &&
        typeof i.food.per.kcal === 'number' &&
        i.grams > 0,
    );
    if (items.length) out[k] = items;
  }
  return out;
}
