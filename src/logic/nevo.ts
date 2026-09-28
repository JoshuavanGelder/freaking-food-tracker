// NEVO: het Nederlands Voedingsstoffenbestand van het RIVM (basisproducten zoals
// appel, kwark, volkorenbrood). De gegevens zitten in de app, dus zoeken werkt
// meteen tijdens het typen en ook zonder internet.
// Bron: NEVO-online, RIVM, Bilthoven. De waarden worden niet aangepast.

import type { Food } from './off';

/** [code, naam, synoniemen, eenheid, kcal, eiwit, koolhydraten, vet, vezels, suikers, verzadigd vet] per 100 g of ml. */
export type NevoItem = [number, string, string, 'g' | 'ml', number, number, number, number, number | null, number | null, number | null];

export type NevoData = { version: string; source: string; items: NevoItem[] };

/** Kleine letters, zonder accenten en leestekens: "Crème fraîche" → "creme fraiche". */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

type Indexed = { item: NevoItem; name: string; syns: string[]; hay: string };

const cache = new WeakMap<NevoItem[], Indexed[]>();

function indexOf(items: NevoItem[]): Indexed[] {
  let idx = cache.get(items);
  if (!idx) {
    idx = items.map((item) => {
      const name = norm(item[1]);
      // Synoniemen staan met / gescheiden: "Havermout/Mout haver-/Havervlokken".
      const syns = (item[2] ?? '').split('/').map(norm).filter(Boolean);
      return { item, name, syns, hay: ` ${name} ${syns.join(' ')} ` };
    });
    cache.set(items, idx);
  }
  return idx;
}

const PREPARED = /\b(gekookt|gebakken|gefrituurd|gegrild|gestoofd|gesmoord|bereid)\b/;

/** Hoe goed past een naam of synoniem bij de zoekopdracht (lager is beter). */
function fit(phrase: string, q: string, first: string): number {
  if ((phrase + ' ').startsWith(q + ' ')) return 0; // los woord: "appel" → "Appel m schil"
  if (phrase.startsWith(q)) return 1; // "appel" → "Appelmoes"
  const words = phrase.split(' ');
  if (words.some((w) => w.replace(/-$/, '').endsWith(first) && w.length > first.length)) return 2; // "brood" → "Tarwebrood"
  if (words.some((w) => w.startsWith(first))) return 3; // "havermout" → "Pap havermout-"
  return 4;
}

/**
 * Zoekt in de NEVO-lijst. Alle woorden uit de zoekopdracht moeten voorkomen
 * (ook midden in een samenstelling: "brood" vindt "volkorenbrood").
 * Losse woorden en namen die met de zoekopdracht beginnen staan bovenaan, daarna kortere namen.
 */
export function searchIn(items: NevoItem[], query: string, limit = 25): NevoItem[] {
  const q = norm(query);
  const tokens = q.split(' ').filter(Boolean);
  if (!tokens.length || q.length < 2) return [];
  const NAME = [-1500, -1000, -750, -700, 0];
  const SYN = [-1400, -650, -600, -550, 0];
  const scored: { it: Indexed; score: number }[] = [];
  for (const it of indexOf(items)) {
    if (!tokens.every((t) => it.hay.includes(t))) continue;
    let bonus = NAME[fit(it.name, q, tokens[0])];
    for (const syn of it.syns) bonus = Math.min(bonus, SYN[fit(syn, q, tokens[0])]);
    let score = it.name.length + bonus;
    // Rauw/onbereid is meestal wat je bedoelt; bereide varianten iets lager, tenzij je ernaar zoekt.
    if (PREPARED.test(it.name) && !PREPARED.test(q)) score += 30;
    scored.push({ it, score });
  }
  scored.sort((a, b) => a.score - b.score || a.it.name.localeCompare(b.it.name));
  return scored.slice(0, limit).map((s) => s.it.item);
}

export function nevoToFood(item: NevoItem): Food {
  const [code, name, , unit, kcal, e, k, v, fiber, sugar, satFat] = item;
  return {
    id: 'nevo:' + code,
    name,
    per: {
      kcal,
      e,
      k,
      v,
      ...(fiber != null ? { fiber } : {}),
      ...(sugar != null ? { sugar } : {}),
      ...(satFat != null ? { satFat } : {}),
    },
    unit,
    source: 'nevo',
  };
}
