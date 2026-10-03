// Synchroniseren met de cloud (Supabase), als pure functies zonder React of netwerk, zodat ze los te testen zijn.
//
// Idee: de telefoon blijft de bron. We onthouden per onderdeel een hash van de laatst gesynchroniseerde versie
// (de "snapshot"). Wat daarvan afwijkt is een lokale wijziging en gaat omhoog; wat niet afwijkt mag door de server
// worden bijgewerkt. Zo hoeven de acties in store.tsx niets van de cloud te weten.
//
// Onderdelen:
// - entries: logregels, per id (verwijderen = tombstone `deleted`)
// - weights: per datum
// - meta: profiel, doelen, recent en laatste porties, naam (één rij per gebruiker, nieuwste wint)
// - library: eigen/bekende producten, favorieten, favoriete maaltijden, imports (één rij per gebruiker)
//
// Geen runtime-imports uit andere logic-bestanden (alleen types), zie CLAUDE.md.

import type { Goals, Profile, WeightEntry } from './calc';
import type { Food } from './off';

export type SyncEntry = { id: string; date: string; meal: 'ontbijt' | 'lunch' | 'diner' | 'snacks'; food: Food; grams: number };
export type SyncFavMeal = { id: string; name: string; items: { food: Food; grams: number }[] };

/** Het deel van AppState dat gesynchroniseerd wordt (zelfde vorm als in store.tsx). */
export type SyncState = {
  profile: Profile | null;
  goals: Goals;
  log: SyncEntry[];
  weights: WeightEntry[];
  foods: Record<string, Food>;
  favorites: string[];
  recent: string[];
  lastPortion: Record<string, number>;
  favMeals: SyncFavMeal[];
  imports: string[];
};

export type SyncSnapshot = {
  entries: Record<string, string>;
  weights: Record<string, string>;
  meta: string;
  library: string;
  /** updated_ms van de laatst geziene/verstuurde meta- en library-rij. 0 = nog nooit gesynchroniseerd. */
  metaMs: number;
  libraryMs: number;
};

export const EMPTY_SNAPSHOT: SyncSnapshot = { entries: {}, weights: {}, meta: '', library: '', metaMs: 0, libraryMs: 0 };

// ---------- rijen zoals in de database ----------

export type EntryRow = { id: string; date: string; meal: string; food: Food | null; grams: number | null; deleted: boolean; updated_ms: number };
export type WeightRow = { date: string; kg: number | null; deleted: boolean; updated_ms: number };
export type MetaData = { profile: Profile | null; goals: Goals; recent: string[]; lastPortion: Record<string, number>; name: string };
export type MetaRow = { profile: Profile | null; goals: Partial<Goals> | null; prefs: { recent?: string[]; lastPortion?: Record<string, number> } | null; name: string | null; updated_ms: number };
export type LibraryData = { foods: Record<string, Food>; favorites: string[]; favMeals: SyncFavMeal[]; imports: string[] };
export type LibraryRow = { data: Partial<LibraryData> | null; updated_ms: number };

// ---------- hashing ----------

/** JSON met gesorteerde sleutels, zodat dezelfde inhoud altijd dezelfde tekst geeft (jsonb sorteert sleutels om). */
export function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return x === undefined ? 'null' : JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',') + ']';
  const keys = Object.keys(x as object)
    .filter((k) => (x as any)[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((x as any)[k])).join(',') + '}';
}

/** Korte hash (FNV-1a, 2 × 32 bit) plus lengte; ruim genoeg om wijzigingen te herkennen. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36) + s.length.toString(36);
}

const h = (x: unknown) => hashText(stableStringify(x));

export const entryHash = (e: SyncEntry) => h([e.date, e.meal, e.grams, e.food]);
export const weightHash = (w: WeightEntry) => String(w.kg);

export function metaOf(s: SyncState, name: string): MetaData {
  return { profile: s.profile, goals: s.goals, recent: s.recent, lastPortion: s.lastPortion, name };
}
export function libraryOf(s: SyncState): LibraryData {
  return { foods: s.foods, favorites: s.favorites, favMeals: s.favMeals, imports: s.imports };
}
export const metaHash = (m: MetaData) => h(m);
export const libraryHash = (l: LibraryData) => h(l);

// ---------- omhoog (push) ----------

export type PushPlan = {
  upsertEntries: EntryRow[];
  deleteEntries: string[];
  upsertWeights: WeightRow[];
  deleteWeights: string[];
  meta: (MetaData & { updated_ms: number }) | null;
  library: (LibraryData & { updated_ms: number }) | null;
  /** Hashes zoals ze na een geslaagde push in de snapshot komen (null = weg uit de snapshot). */
  done: { entries: Record<string, string | null>; weights: Record<string, string | null>; meta?: string; library?: string };
};

export function planPush(s: SyncState, snap: SyncSnapshot, name: string, now: number): PushPlan {
  const plan: PushPlan = { upsertEntries: [], deleteEntries: [], upsertWeights: [], deleteWeights: [], meta: null, library: null, done: { entries: {}, weights: {} } };

  const ids = new Set<string>();
  for (const e of s.log) {
    ids.add(e.id);
    const hh = entryHash(e);
    if (snap.entries[e.id] === hh) continue;
    plan.upsertEntries.push({ id: e.id, date: e.date, meal: e.meal, food: e.food, grams: e.grams, deleted: false, updated_ms: now });
    plan.done.entries[e.id] = hh;
  }
  for (const id of Object.keys(snap.entries)) {
    if (ids.has(id)) continue;
    plan.deleteEntries.push(id);
    plan.done.entries[id] = null;
  }

  const dates = new Set<string>();
  for (const w of s.weights) {
    dates.add(w.date);
    const hh = weightHash(w);
    if (snap.weights[w.date] === hh) continue;
    plan.upsertWeights.push({ date: w.date, kg: w.kg, deleted: false, updated_ms: now });
    plan.done.weights[w.date] = hh;
  }
  for (const d of Object.keys(snap.weights)) {
    if (dates.has(d)) continue;
    plan.deleteWeights.push(d);
    plan.done.weights[d] = null;
  }

  const meta = metaOf(s, name);
  const mh = metaHash(meta);
  // Zonder profiel (nog in de onboarding) sturen we geen meta: dan zou een leeg profiel het echte overschrijven.
  if (mh !== snap.meta && s.profile) {
    plan.meta = { ...meta, updated_ms: now };
    plan.done.meta = mh;
  }
  const lib = libraryOf(s);
  const lh = libraryHash(lib);
  if (lh !== snap.library) {
    plan.library = { ...lib, updated_ms: now };
    plan.done.library = lh;
  }
  return plan;
}

export function isEmptyPlan(p: PushPlan): boolean {
  return !p.upsertEntries.length && !p.deleteEntries.length && !p.upsertWeights.length && !p.deleteWeights.length && !p.meta && !p.library;
}

/** Snapshot na een geslaagde push. */
export function afterPush(snap: SyncSnapshot, plan: PushPlan): SyncSnapshot {
  const entries = { ...snap.entries };
  for (const [id, hh] of Object.entries(plan.done.entries)) {
    if (hh == null) delete entries[id];
    else entries[id] = hh;
  }
  const weights = { ...snap.weights };
  for (const [d, hh] of Object.entries(plan.done.weights)) {
    if (hh == null) delete weights[d];
    else weights[d] = hh;
  }
  return {
    entries,
    weights,
    meta: plan.done.meta ?? snap.meta,
    library: plan.done.library ?? snap.library,
    metaMs: plan.meta ? plan.meta.updated_ms : snap.metaMs,
    libraryMs: plan.library ? plan.library.updated_ms : snap.libraryMs,
  };
}

// ---------- omlaag (pull) ----------

export type Remote = { entries: EntryRow[]; weights: WeightRow[]; meta: MetaRow | null; library: LibraryRow | null };

const MEALS = ['ontbijt', 'lunch', 'diner', 'snacks'];

function mergeLibrary(local: LibraryData, remote: Partial<LibraryData>): LibraryData {
  const foods = { ...(remote.foods ?? {}), ...local.foods };
  const favorites = [...local.favorites, ...(remote.favorites ?? []).filter((id) => !local.favorites.includes(id) && id in foods)];
  const haveMeal = new Set(local.favMeals.map((m) => m.id));
  const favMeals = [...local.favMeals, ...(remote.favMeals ?? []).filter((m) => m && !haveMeal.has(m.id))];
  const imports = [...local.imports, ...(remote.imports ?? []).filter((id) => !local.imports.includes(id))];
  return { foods, favorites, favMeals, imports };
}

/**
 * Verwerkt wat er van de server komt. Lokale wijzigingen die nog niet verstuurd zijn winnen altijd
 * (ze gaan bij de volgende push omhoog). Bij de allereerste sync wint het profiel van de server
 * (je logt in op een bestaand account) en worden producten en favorieten samengevoegd.
 */
export function applyPull<S extends SyncState>(
  s: S,
  snap: SyncSnapshot,
  remote: Remote,
  name: string,
): { state: S; snap: SyncSnapshot; name: string; changed: boolean } {
  let changed = false;
  const entries = { ...snap.entries };
  const weightsSnap = { ...snap.weights };

  // logregels
  let log = s.log;
  if (remote.entries.length) {
    const byId = new Map(log.map((e, i) => [e.id, i] as const));
    const next = [...log];
    const remove = new Set<string>();
    for (const r of remote.entries) {
      const i = byId.get(r.id);
      const local = i != null ? next[i] : null;
      const localHash = local ? entryHash(local) : null;
      if (localHash !== (snap.entries[r.id] ?? null)) continue; // lokaal gewijzigd of verwijderd: lokaal wint
      if (r.deleted) {
        if (local) remove.add(r.id);
        delete entries[r.id];
        continue;
      }
      if (!r.food || !(r.grams! > 0) || !MEALS.includes(r.meal)) continue;
      const e: SyncEntry = { id: r.id, date: r.date, meal: r.meal as SyncEntry['meal'], food: r.food, grams: r.grams! };
      const hh = entryHash(e);
      entries[r.id] = hh;
      if (hh === localHash) continue;
      if (i != null) next[i] = e;
      else {
        byId.set(e.id, next.length);
        next.push(e);
      }
      changed = true;
    }
    if (remove.size) changed = true;
    log = remove.size ? next.filter((e) => !remove.has(e.id)) : next;
  }

  // gewichten
  let weights = s.weights;
  if (remote.weights.length) {
    const next = [...weights];
    for (const r of remote.weights) {
      const i = next.findIndex((w) => w.date === r.date);
      const localHash = i >= 0 ? weightHash(next[i]) : null;
      if (localHash !== (snap.weights[r.date] ?? null)) continue;
      if (r.deleted || !(r.kg! > 0)) {
        if (i >= 0) {
          next.splice(i, 1);
          changed = true;
        }
        delete weightsSnap[r.date];
        continue;
      }
      const w = { date: r.date, kg: r.kg! };
      weightsSnap[r.date] = weightHash(w);
      if (localHash === weightsSnap[r.date]) continue;
      if (i >= 0) next[i] = w;
      else next.push(w);
      changed = true;
    }
    weights = next;
  }

  let state: S = { ...s, log, weights };
  let outName = name;
  let meta = snap.meta;
  let metaMs = snap.metaMs;
  let library = snap.library;
  let libraryMs = snap.libraryMs;

  // meta
  const m = remote.meta;
  if (m && m.updated_ms > snap.metaMs) {
    const first = snap.metaMs === 0;
    const dirty = metaHash(metaOf(s, name)) !== snap.meta;
    if (first || !dirty) {
      state = {
        ...state,
        profile: m.profile ?? state.profile,
        goals: { ...state.goals, ...(m.goals ?? {}) },
        recent: Array.isArray(m.prefs?.recent) ? m.prefs!.recent! : state.recent,
        lastPortion: m.prefs?.lastPortion && typeof m.prefs.lastPortion === 'object' ? m.prefs.lastPortion : state.lastPortion,
      };
      outName = m.name ?? name;
      meta = metaHash(metaOf(state, outName));
      changed = true;
    }
    metaMs = m.updated_ms;
  }

  // producten, favorieten, favoriete maaltijden
  const l = remote.library;
  if (l && l.updated_ms > snap.libraryMs && l.data) {
    const local = libraryOf(state);
    const first = snap.libraryMs === 0;
    const dirty = libraryHash(local) !== snap.library;
    if (!first && !dirty) {
      const data = l.data;
      const next: LibraryData = {
        foods: data.foods ?? {},
        favorites: data.favorites ?? [],
        favMeals: data.favMeals ?? [],
        imports: data.imports ?? [],
      };
      state = { ...state, ...next };
      library = libraryHash(next);
    } else {
      // samenvoegen; het resultaat blijft "gewijzigd" en gaat bij de push omhoog
      state = { ...state, ...mergeLibrary(local, l.data) };
    }
    libraryMs = l.updated_ms;
    changed = true;
  }

  return { state, snap: { entries, weights: weightsSnap, meta, library, metaMs, libraryMs }, name: outName, changed };
}
