// Reservekopie terugzetten uit een export ("Alles", `fft-export` v1 met veld `backup`).
// De reservekopie is de volledige app-state (zoals in AsyncStorage). Terugzetten voegt samen:
// wat al op de telefoon staat blijft staan, wat ontbreekt komt erbij. Zo gaat er nooit iets verloren,
// ook niet als je per ongeluk een oudere reservekopie terugzet.
// Pure functies zonder runtime-imports uit andere logic-bestanden (alleen types), zie CLAUDE.md.

import type { Goals, Profile, WeightEntry } from './calc';
import type { Food } from './off';

export type BackupEntry = { id: string; date: string; meal: 'ontbijt' | 'lunch' | 'diner' | 'snacks'; food: Food; grams: number };
export type BackupFavMeal = { id: string; name: string; items: { food: Food; grams: number }[] };

/** Zelfde vorm als AppState in store.tsx. */
export type BackupState = {
  version: 1;
  profile: Profile | null;
  goals: Partial<Goals>;
  log: BackupEntry[];
  weights: WeightEntry[];
  foods: Record<string, Food>;
  favorites: string[];
  recent: string[];
  lastPortion: Record<string, number>;
  favMeals: BackupFavMeal[];
  imports: string[];
};

export type ParsedBackup = { exportedAt: string; state: BackupState; skipped: number };

export type BackupParse =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; error: string }
  /** Geen export van deze app: dan is het misschien een gewone importtekst. */
  | { ok: false; notExport: true };

const MEALS = ['ontbijt', 'lunch', 'diner', 'snacks'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFood(f: any): f is Food {
  return !!f && typeof f.id === 'string' && typeof f.name === 'string' && !!f.per && typeof f.per.kcal === 'number';
}

function isEntry(e: any): e is BackupEntry {
  return !!e && typeof e.id === 'string' && DATE.test(e.date ?? '') && MEALS.includes(e.meal) && isFood(e.food) && e.grams > 0;
}

function isWeight(w: any): w is WeightEntry {
  return !!w && DATE.test(w.date ?? '') && typeof w.kg === 'number' && w.kg > 0;
}

function isFavMeal(m: any): m is BackupFavMeal {
  return !!m && typeof m.id === 'string' && typeof m.name === 'string' && Array.isArray(m.items) && m.items.every((i: any) => isFood(i?.food) && i.grams > 0);
}

const strings = (x: any): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : []);

export function parseBackup(text: string): BackupParse {
  const t = text.trim();
  if (!t) return { ok: false, notExport: true };
  let raw: any;
  try {
    raw = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return { ok: false, notExport: true };
  }
  if (!raw || raw.type !== 'fft-export') return { ok: false, notExport: true };
  if (raw.v !== 1) return { ok: false, error: 'Deze export komt uit een nieuwere versie van de app. Werk de app eerst bij.' };
  if (raw.scope !== 'all') {
    return { ok: false, error: 'Dit is een export van één week. Terugzetten kan alleen met een export van "Alles".' };
  }
  const b = raw.backup;
  if (!b || typeof b !== 'object') {
    return { ok: false, error: 'Deze export is gemaakt voordat terugzetten bestond. Maak een nieuwe export met "Alles".' };
  }
  if (b.version !== 1 || !Array.isArray(b.log)) return { ok: false, error: 'De reservekopie in dit bestand is beschadigd.' };

  let skipped = 0;
  const keep = <X>(list: any, ok: (x: any) => x is X): X[] => {
    if (!Array.isArray(list)) return [];
    const good = list.filter(ok);
    skipped += list.length - good.length;
    return good;
  };

  const foods: Record<string, Food> = {};
  if (b.foods && typeof b.foods === 'object') {
    for (const [id, f] of Object.entries(b.foods)) {
      if (isFood(f) && f.id === id) foods[id] = f;
      else skipped++;
    }
  }
  const lastPortion: Record<string, number> = {};
  if (b.lastPortion && typeof b.lastPortion === 'object') {
    for (const [id, g] of Object.entries(b.lastPortion)) if (typeof g === 'number' && g > 0) lastPortion[id] = g;
  }
  const profile =
    b.profile && typeof b.profile === 'object' && typeof b.profile.age === 'number' && typeof b.profile.heightCm === 'number'
      ? (b.profile as Profile)
      : null;

  const state: BackupState = {
    version: 1,
    profile,
    goals: b.goals && typeof b.goals === 'object' ? (b.goals as Partial<Goals>) : {},
    log: keep(b.log, isEntry),
    weights: keep(b.weights, isWeight),
    foods,
    favorites: strings(b.favorites),
    recent: strings(b.recent),
    lastPortion,
    favMeals: keep(b.favMeals, isFavMeal),
    imports: strings(b.imports),
  };
  return { ok: true, backup: { exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', state, skipped } };
}

function mealKey(items: { food: Food; grams: number }[]): string {
  return items
    .map((i) => `${i.food.id}@${Math.round(i.grams)}`)
    .sort()
    .join('|');
}

export type MergeCounts = { entries: number; days: number; weights: number; foods: number; favMeals: number; favorites: number };

/**
 * Voegt de reservekopie samen met wat er nu in de app staat. Bestaande gegevens winnen bij een dubbel
 * (zelfde id, of bij gewicht dezelfde datum). `withProfile`: profiel en doelen uit de reservekopie overnemen.
 */
export function mergeBackup<S extends BackupState>(current: S, backup: BackupState, withProfile: boolean): { state: S; added: MergeCounts } {
  const haveEntry = new Set(current.log.map((e) => e.id));
  const newEntries = backup.log.filter((e) => !haveEntry.has(e.id));

  const haveWeight = new Set(current.weights.map((w) => w.date));
  const newWeights = backup.weights.filter((w) => !haveWeight.has(w.date));

  const newFoodIds = Object.keys(backup.foods).filter((id) => !(id in current.foods));
  const foods = { ...backup.foods, ...current.foods };

  const newFavorites = backup.favorites.filter((id) => !current.favorites.includes(id) && (id in foods));

  const haveMealId = new Set(current.favMeals.map((m) => m.id));
  const haveMealKey = new Set(current.favMeals.map((m) => mealKey(m.items)));
  const newFavMeals = backup.favMeals.filter((m) => !haveMealId.has(m.id) && (m.items.length === 0 || !haveMealKey.has(mealKey(m.items))));

  const recent = [...current.recent, ...backup.recent.filter((id) => !current.recent.includes(id))].slice(0, 40);
  const imports = [...current.imports, ...backup.imports.filter((id) => !current.imports.includes(id))];

  const takeProfile = withProfile && backup.profile != null;
  const state: S = {
    ...current,
    profile: takeProfile ? backup.profile : current.profile,
    goals: takeProfile ? { ...current.goals, ...backup.goals } : current.goals,
    log: [...current.log, ...newEntries],
    weights: [...current.weights, ...newWeights],
    foods,
    favorites: [...current.favorites, ...newFavorites],
    recent,
    lastPortion: { ...backup.lastPortion, ...current.lastPortion },
    favMeals: [...current.favMeals, ...newFavMeals],
    imports,
  };
  return {
    state,
    added: {
      entries: newEntries.length,
      days: new Set(newEntries.map((e) => e.date)).size,
      weights: newWeights.length,
      foods: newFoodIds.length,
      favMeals: newFavMeals.length,
      favorites: newFavorites.length,
    },
  };
}

/** Kort overzicht van wat er in een reservekopie staat. */
export function backupSummary(b: BackupState) {
  const days = new Set(b.log.map((e) => e.date));
  const dates = [...days].sort();
  return {
    days: days.size,
    entries: b.log.length,
    weights: b.weights.length,
    ownFoods: Object.values(b.foods).filter((f) => f.source === 'eigen' && !f.id.startsWith('summary:')).length,
    favMeals: b.favMeals.length,
    favorites: b.favorites.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}
