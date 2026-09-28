// Open Food Facts: merkproducten zoeken en barcodes opzoeken.
// Limieten van OFF: 15 productopvragingen en 10 zoekopdrachten per minuut,
// daarom zoeken we alleen als je op zoeken drukt, niet tijdens het typen.

import type { Per100 } from './calc';

export type Unit = 'g' | 'ml';

export type Food = {
  id: string;
  name: string;
  brand?: string;
  /** Voedingswaarden per 100 g, of per 100 ml bij dranken. */
  per: Per100;
  /** Gebruikelijke portie in g of ml (zie `unit`). */
  servingG?: number;
  /** Omschrijving van die portie, bijv. "1 bolletje" of "hele verpakking". */
  servingLabel?: string;
  /** Eenheid van porties; ontbreekt bij producten van vóór versie 2 (dan gram). */
  unit?: Unit;
  source: 'off' | 'eigen';
};

export function unitOf(f: Food): Unit {
  return f.unit ?? 'g';
}

const HEADERS = { 'User-Agent': 'FreakingFoodTracker/0.1 (Android; persoonlijk project)' };
const FIELDS = [
  'code',
  'product_name',
  'product_name_nl',
  'generic_name_nl',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_quantity_unit',
  'serving_size',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
].join(',');

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Haalt "250 ml", "33cl", "1,5 l" of "50 g" uit een stuk tekst, omgerekend naar g of ml. */
export function parseAmount(text: unknown): { n: number; unit: Unit } | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|ml|cl|dl|liter|ltr|l)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg') return { n: n * 1000, unit: 'g' };
  if (u === 'g' || u === 'gr' || u === 'gram') return { n, unit: 'g' };
  if (u === 'ml') return { n, unit: 'ml' };
  if (u === 'cl') return { n: n * 10, unit: 'ml' };
  if (u === 'dl') return { n: n * 100, unit: 'ml' };
  return { n: n * 1000, unit: 'ml' };
}

function unitWord(x: unknown): Unit | undefined {
  if (typeof x !== 'string') return undefined;
  const u = x.trim().toLowerCase();
  if (['ml', 'cl', 'dl', 'l', 'liter'].includes(u)) return 'ml';
  if (['g', 'gr', 'kg', 'gram'].includes(u)) return 'g';
  return undefined;
}

function detectUnit(p: any): Unit {
  return (
    unitWord(p.product_quantity_unit) ??
    unitWord(p.serving_quantity_unit) ??
    parseAmount(p.quantity)?.unit ??
    parseAmount(p.serving_size)?.unit ??
    'g'
  );
}

/** Kiest een logische standaardportie: opgegeven portie, per stuk, of de hele (kleine) verpakking. */
function detectServing(p: any, unit: Unit): { n: number; label?: string } | undefined {
  const sizeText = typeof p.serving_size === 'string' ? p.serving_size.trim() : '';
  const fromText = parseAmount(sizeText);
  const sq = num(p.serving_quantity) ?? (fromText && fromText.unit === unit ? fromText.n : undefined);
  if (sq && sq > 0) {
    // "1 bolletje (50 g)" -> "1 bolletje"; "250 ml" -> geen label
    const label = sizeText.replace(/\(.*?\)/g, '').replace(/(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|ml|cl|dl|liter|ltr|l)\b/gi, '').trim();
    return { n: sq, label: label && /[a-z]/i.test(label) ? label : undefined };
  }
  const total = num(p.product_quantity) ?? parseAmount(p.quantity)?.n;
  const qText = typeof p.quantity === 'string' ? p.quantity : '';
  const count = qText.match(/(\d+)\s*(?:x|×|stuks|stuk|st\b|st\.)/i);
  if (total && count) {
    const c = parseInt(count[1], 10);
    if (c > 1) return { n: Math.round(total / c), label: '1 stuk' };
  }
  const small = unit === 'ml' ? 500 : 250;
  if (total && total > 0 && total <= small) return { n: total, label: 'hele verpakking' };
  return undefined;
}

export function toFood(p: any): Food | null {
  if (!p || !p.code) return null;
  const n = p.nutriments ?? {};
  const unit = detectUnit(p);
  const serving = detectServing(p, unit);

  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  // Soms staan de waarden alleen per portie: dan omrekenen naar per 100.
  let factor = 1;
  let suffix = '_100g';
  if (kcal == null && serving) {
    const ks = num(n['energy-kcal_serving']) ?? (num(n['energy-kj_serving']) ?? NaN) / 4.184;
    if (Number.isFinite(ks)) {
      kcal = (ks * 100) / serving.n;
      factor = 100 / serving.n;
      suffix = '_serving';
    }
  }
  if (kcal == null || !Number.isFinite(kcal)) return null;
  const name = String(p.product_name_nl || p.product_name || p.generic_name_nl || '').trim();
  if (!name) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  const val = (key: string) => {
    const v = num(n[key + suffix]);
    return v == null ? undefined : v * factor;
  };
  return {
    id: 'off:' + p.code,
    name,
    brand: brand || undefined,
    per: {
      kcal,
      e: val('proteins') ?? 0,
      k: val('carbohydrates') ?? 0,
      v: val('fat') ?? 0,
      fiber: val('fiber'),
      salt: val('salt'),
      satFat: val('saturated-fat'),
      sugar: val('sugars'),
    },
    servingG: serving?.n,
    servingLabel: serving?.label,
    unit,
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

function fmt(x: number, decimals = 0): string {
  return x.toLocaleString('nl-NL', { maximumFractionDigits: decimals });
}

/** Aantal porties als de hoeveelheid een veelvoud van een halve portie is, anders null. */
export function portionCount(food: Food, amount: number): number | null {
  if (!food.servingG || food.servingG <= 0 || amount <= 0) return null;
  const ratio = amount / food.servingG;
  const half = Math.round(ratio * 2) / 2;
  return half > 0 && Math.abs(ratio - half) < 0.01 ? half : null;
}

/** "2× 1 bolletje · 100 g" of gewoon "100 g". */
export function amountText(food: Food, amount: number): string {
  if (food.id.startsWith('summary:')) return 'dagtotaal';
  const u = unitOf(food);
  const count = portionCount(food, amount);
  const base = `${fmt(amount)} ${u}`;
  if (count == null) return base;
  const what = food.servingLabel && /^1\s/.test(food.servingLabel) ? food.servingLabel.replace(/^1\s+/, '') : 'portie';
  return `${fmt(count, 1)}× ${what} · ${base}`;
}
