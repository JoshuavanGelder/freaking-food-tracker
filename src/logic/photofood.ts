// AI-herkenning (foto of beschrijving): het antwoord van de Edge Function `food-photo` controleren en elk onderdeel koppelen
// aan een product uit NEVO of je eigen producten. De AI levert alleen naam, zoekterm en grammen;
// de voedingswaarden komen uit NEVO (of je eigen product). Vindt de app niets, dan gebruiken we de
// schatting van de AI, duidelijk gemarkeerd.
// Geen runtime-imports uit andere logic-bestanden (zie CLAUDE.md): zoekfuncties worden meegegeven.

import type { Food, Unit } from './off';

export type Confidence = 'hoog' | 'midden' | 'laag';

export type PhotoItem = {
  name: string;
  query: string;
  grams: number;
  unit: Unit;
  confidence: Confidence;
  /** Hoeveelheid in gewone woorden, bijv. "2 stuks" of "1 glas" (kan leeg zijn). */
  portion: string;
  /** Schatting van de AI per 100 g/ml, alleen als reserve. */
  per: { kcal: number; e: number; k: number; v: number };
};

export type PhotoResult = { title: string; items: PhotoItem[]; hiddenFat: boolean; note: string };

const MAX_ITEMS = 10;

function num(x: unknown, min: number, max: number): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function str(x: unknown, max = 80): string {
  return typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Rondt grammen af zoals je ze zelf zou intypen: < 20 op 1, < 100 op 5, anders op 10. */
export function roundGrams(g: number): number {
  if (!Number.isFinite(g) || g <= 0) return 1;
  if (g < 20) return Math.max(1, Math.round(g));
  if (g < 100) return Math.round(g / 5) * 5;
  return Math.round(g / 10) * 10;
}

/** Controleert wat de AI teruggeeft; alles wat niet klopt valt weg of krijgt een veilige waarde. */
export function parsePhotoResult(raw: unknown): PhotoResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.onderdelen) ? r.onderdelen : [];
  const items: PhotoItem[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = str(o.naam, 60);
    const grams = num(o.gram, 1, 2000);
    if (!name || grams == null) continue;
    const query = str(o.zoekterm, 60) || name;
    const conf = o.zekerheid === 'hoog' || o.zekerheid === 'laag' ? o.zekerheid : 'midden';
    items.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      query,
      grams: roundGrams(grams),
      unit: o.eenheid === 'ml' ? 'ml' : 'g',
      confidence: conf,
      portion: str(o.portie, 30),
      per: {
        kcal: num(o.kcal, 0, 900) ?? 0,
        e: num(o.eiwit, 0, 100) ?? 0,
        k: num(o.koolhydraten, 0, 100) ?? 0,
        v: num(o.vet, 0, 100) ?? 0,
      },
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return {
    title: str(r.titel, 60) || (items.length ? items.map((i) => i.name).slice(0, 3).join(', ') : 'Maaltijd van foto'),
    items,
    hiddenFat: r.verborgen_vet === true,
    note: str(r.opmerking, 200),
  };
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Product met de schatting van de AI, voor als NEVO en je eigen producten niets opleveren. */
export function aiFood(item: PhotoItem): Food {
  return {
    id: 'ai:' + (slug(item.name) || 'onbekend'),
    name: item.name,
    per: { ...item.per },
    unit: item.unit,
    note: 'Schatting door de AI op basis van een foto. Pas de waarden aan als je ze weet.',
    source: 'eigen',
  };
}

export type MatchSource = 'nevo' | 'mine' | 'ai';

export type Match = {
  item: PhotoItem;
  food: Food;
  grams: number;
  source: MatchSource;
  /** Andere passende producten om uit te kiezen. */
  alternatives: Food[];
};

export type Finders = {
  nevo: (query: string) => Food[];
  mine: (query: string) => Food[];
};

/** Zoektermen van specifiek naar algemeen: "rijst wit gekookt" → "rijst wit" → "rijst", daarna de naam. */
export function queriesFor(item: PhotoItem): string[] {
  const out: string[] = [];
  const add = (q: string) => {
    const t = q.trim();
    if (t.length >= 2 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  const words = item.query.split(/\s+/).filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    // Het laatste losse woord alleen als het lang genoeg is ("kip" is te vaag, "broccoli" niet).
    if (n === 1 && words.length > 1 && words[0].length < 5) break;
    add(words.slice(0, n).join(' '));
  }
  add(item.name);
  return out;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const PREP = /\b(gekookt|gebakken|bereid|gegrild|gestoofd|gesmoord|gefrituurd|gezet|geroosterd)\b/;
const RAW = /\b(rauw|onbereid)\b/;
/** Vormen die je bijna nooit zo eet: poeder, concentraat, droog product. */
const NOT_EATEN = /\b(poeder|geconcentreerd|droog|onbereid|concentraat)\b/;
const LIGHT = /\b(light|zero|zoetstof)\b/;

/**
 * Hoe goed past een NEVO-product bij wat de AI zag (lager is beter). Begint bij de plek in de
 * zoekresultaten en weegt mee: woorden uit naam en zoekterm, bereid of rauw, en vormen die je niet eet.
 */
export function fitScore(food: Food, item: PhotoItem, rank: number): number {
  const name = norm(food.name);
  const words = name.split(' ');
  const want = norm(`${item.query} ${item.name}`);
  let score = rank * 2;
  const seen = new Set<string>();
  for (const w of want.split(' ')) {
    if (!w || seen.has(w)) continue;
    seen.add(w);
    // Korte woorden ("ei") alleen als heel woord, anders vindt "ei" ook "prei".
    if (w.length < 3) {
      if (words.some((n) => n.replace(/-$/, '') === w)) score -= 10;
      continue;
    }
    // "witte rijst" ↔ "rijst witte", "volkorenbrood" ↔ "tarwebrood volkoren": ook stammen en samenstellingen tellen.
    const stem = w.length > 5 ? w.slice(0, -1) : w;
    if (words.some((n) => n.startsWith(stem) || (n.length >= 4 && w.includes(n.replace(/-$/, ''))))) score -= 10;
  }
  if (PREP.test(want)) {
    if (PREP.test(name)) score -= 15;
    if (RAW.test(name)) score += 20;
  }
  if (NOT_EATEN.test(name) && !NOT_EATEN.test(want)) score += 25;
  // Light/zero zie je niet op een foto: alleen als de AI of je hint het noemt.
  if (LIGHT.test(name) && !LIGHT.test(want)) score += 12;
  // Gemiddelde of naturel variant als standaard ("Kiwi gem", "Beschuit naturel").
  if (/\b(gem|naturel)\b/.test(name)) score -= 4;
  return score + words.length;
}

/** Koppelt één onderdeel aan het best passende product. Eigen producten met dezelfde naam gaan voor. */
export function matchItem(item: PhotoItem, find: Finders): Match {
  // Je eigen product dat precies zo heet (bijv. een favoriete "Kipfilet" van de slager) wint.
  const lower = item.name.toLowerCase();
  const mine = find.mine(item.name);
  const own = mine.find((f) => f.name.toLowerCase() === lower);

  // Kandidaten uit NEVO voor alle zoektermen; specifiekere zoektermen tellen iets zwaarder.
  const cand = new Map<string, { food: Food; score: number }>();
  queriesFor(item).forEach((q, qi) => {
    find.nevo(q).slice(0, 10).forEach((f, i) => {
      const score = fitScore(f, item, i) + qi * 3;
      const prev = cand.get(f.id);
      if (!prev || score < prev.score) cand.set(f.id, { food: f, score });
    });
  });
  const ranked = [...cand.values()].sort((a, b) => a.score - b.score).map((c) => c.food);
  const best = ranked[0] ?? null;

  const ai = aiFood(item);
  const food = own ?? best ?? ai;
  const source: MatchSource = own ? 'mine' : best ? 'nevo' : 'ai';
  const alts: Food[] = [];
  const seen = new Set<string>([food.id]);
  for (const f of [...ranked.slice(0, 5), ...mine.slice(0, 3), ai]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    alts.push(f);
  }
  return { item, food, grams: item.grams, source, alternatives: alts.slice(0, 8) };
}

export function matchAll(result: PhotoResult, find: Finders): Match[] {
  return result.items.map((i) => matchItem(i, find));
}

/** Totaal kcal en macro's van de gekozen producten en hoeveelheden. */
export function photoTotals(list: { food: Food; grams: number }[]): { kcal: number; e: number; k: number; v: number } {
  const t = { kcal: 0, e: 0, k: 0, v: 0 };
  for (const { food, grams } of list) {
    t.kcal += (food.per.kcal * grams) / 100;
    t.e += (food.per.e * grams) / 100;
    t.k += (food.per.k * grams) / 100;
    t.v += (food.per.v * grams) / 100;
  }
  return t;
}

/** Nederlandse foutmelding voor een antwoord van de functie dat niet goed ging. */
export function photoError(status: number, body: unknown): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const msg = typeof b.message === 'string' ? b.message : '';
  if (msg) return msg;
  if (status === 401 || status === 403) return 'Je bent uitgelogd. Log opnieuw in.';
  if (status === 404) return 'Fotoherkenning staat nog niet op de server.';
  if (status === 413) return 'De foto is te groot. Probeer het opnieuw.';
  if (status === 429) return 'Even te veel foto’s. Probeer het straks opnieuw.';
  return `Herkennen lukte niet (${status}). Probeer het opnieuw.`;
}
