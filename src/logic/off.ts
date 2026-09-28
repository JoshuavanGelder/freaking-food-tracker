// Open Food Facts: merkproducten zoeken en barcodes opzoeken.
// Limieten van OFF: 15 productopvragingen en 10 zoekopdrachten per minuut,
// daarom zoeken we alleen als je op zoeken drukt, niet tijdens het typen.

import type { Per100 } from './calc';

export type Food = {
  id: string;
  name: string;
  brand?: string;
  per: Per100;
  servingG?: number;
  source: 'off' | 'eigen';
};

const HEADERS = { 'User-Agent': 'FreakingFoodTracker/0.1 (Android; persoonlijk project)' };
const FIELDS = 'code,product_name,product_name_nl,generic_name_nl,brands,nutriments,serving_quantity';

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? parseFloat(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function toFood(p: any): Food | null {
  if (!p || !p.code) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null) return null;
  const name = String(p.product_name_nl || p.product_name || p.generic_name_nl || '').trim();
  if (!name) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  return {
    id: 'off:' + p.code,
    name,
    brand: brand || undefined,
    per: {
      kcal,
      e: num(n.proteins_100g) ?? 0,
      k: num(n.carbohydrates_100g) ?? 0,
      v: num(n.fat_100g) ?? 0,
      fiber: num(n.fiber_100g),
      salt: num(n.salt_100g),
      satFat: num(n['saturated-fat_100g']),
      sugar: num(n.sugars_100g),
    },
    servingG: num(p.serving_quantity),
    source: 'off',
  };
}

async function getJson(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch {
    throw new Error('Geen verbinding. Controleer je internet en probeer het opnieuw.');
  }
  if (res.status === 429 || res.status === 503) {
    throw new Error('Even te veel opvragingen bij Open Food Facts. Probeer het over een minuut opnieuw.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts gaf een fout (${res.status}).`);
  return res.json();
}

export type BarcodeResult = { kind: 'found'; food: Food } | { kind: 'incomplete'; name?: string } | { kind: 'notfound' };

export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  const json = await getJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
  );
  if (!json || json.status !== 1 || !json.product) return { kind: 'notfound' };
  const food = toFood({ ...json.product, code: json.product.code || code });
  if (!food) return { kind: 'incomplete', name: json.product.product_name_nl || json.product.product_name };
  return { kind: 'found', food };
}

export async function searchFoods(query: string): Promise<Food[]> {
  const q = encodeURIComponent(query.trim());
  const json = await getJson(
    `https://nl.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=30&fields=${FIELDS}`,
  );
  const products: any[] = json?.products ?? [];
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of products) {
    const f = toFood(p);
    if (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}
