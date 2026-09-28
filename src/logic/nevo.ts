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

type Indexed = { item: NevoItem; name: string; hay: string };

const cache = new WeakMap<NevoItem[], Indexed[]>();

function indexOf(items: NevoItem[]): Indexed[] {
  let idx = cache.get(items);
  if (!idx) {
    idx = items.map((item) => {
      const name = norm(item[1]);
      return { item, name, hay: ` ${name} ${norm(item[2] ?? '')} ` };
    });
    cache.set(items, idx);
  }
  return idx;
}

/**
 * Zoekt in de NEVO-lijst. Alle woorden uit de zoekopdracht moeten voorkomen
 * (ook midden in een samenstelling: "brood" vindt "volkorenbrood").
 * Namen die met de zoekopdracht beginnen en kortere namen staan bovenaan.
 */
export function searchIn(items: NevoItem[], query: string, limit = 25): NevoItem[] {
  const q = norm(query);
  const tokens = q.split(' ').filter(Boolean);
  if (!tokens.length || q.length < 2) return [];
  const scored: { it: Indexed; score: number }[] = [];
  for (const it of indexOf(items)) {
    if (!tokens.every((t) => it.hay.includes(t))) continue;
    let score = it.name.length;
    if ((it.name + ' ').startsWith(q + ' ')) score -= 1500; // "appel" → eerst "Appel ...", dan "Appelmoes"
    else if (it.name.startsWith(q)) score -= 1000;
    else if (it.name.startsWith(tokens[0])) score -= 700;
    else if (it.hay.includes(' ' + tokens[0])) score -= 400;
    // "rauw", "onbereid" en "gemiddeld" zijn meestal wat je bedoelt; bereide varianten iets lager.
    if (/\b(gekookt|gebakken|gefrituurd|gegrild|gestoofd|bereid)\b/.test(it.name) && !/(gekookt|gebakken|gefrituurd|gegrild|gestoofd|bereid)/.test(q))
      score += 30;
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
