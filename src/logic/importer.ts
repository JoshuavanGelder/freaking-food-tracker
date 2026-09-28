// Importeren van eetgegevens uit tekst (JSON), bijvoorbeeld overgezet uit Foodvisor.
// Voedingswaarden in het bestand gelden voor de gelogde hoeveelheid; de app rekent ze om naar per 100.

import type { Food, Unit } from './off';

export type MealKey = 'ontbijt' | 'lunch' | 'diner' | 'snacks';

export type ImportItem = {
  meal: MealKey;
  name: string;
  brand?: string;
  amount: number;
  unit?: Unit;
  kcal: number;
  e?: number;
  k?: number;
  v?: number;
  fiber?: number;
  portions?: number;
  portionLabel?: string;
  /** Andere datum dan die van het bestand. */
  date?: string;
  /** Alleen een dagtotaal, zonder losse producten (komt niet in Recent/Eigen). */
  summary?: boolean;
};

export type ImportFile = {
  type: 'fft-import';
  v: 1;
  id: string;
  date: string;
  source?: string;
  items: ImportItem[];
  favMeals?: { name: string; meal: MealKey }[];
};

export type ImportEntry = { date: string; meal: MealKey; food: Food; grams: number; summary?: boolean };

const MEALS: MealKey[] = ['ontbijt', 'lunch', 'diner', 'snacks'];

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseImport(text: string): { ok: true; file: ImportFile } | { ok: false; error: string } {
  let raw: any;
  const t = text.trim();
  if (!t) return { ok: false, error: 'Plak eerst de importtekst.' };
  try {
    raw = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return { ok: false, error: 'Dit is geen geldige importtekst. Kopieer hem opnieuw, helemaal van { tot }.' };
  }
  if (!raw || raw.type !== 'fft-import' || raw.v !== 1) return { ok: false, error: 'Onbekend formaat.' };
  if (typeof raw.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? '')) return { ok: false, error: 'Datum of id ontbreekt.' };
  if (!Array.isArray(raw.items) || raw.items.length === 0) return { ok: false, error: 'Er staan geen producten in.' };
  for (const [i, it] of raw.items.entries()) {
    const where = `Regel ${i + 1}`;
    if (!MEALS.includes(it.meal)) return { ok: false, error: `${where}: onbekende maaltijd.` };
    if (typeof it.name !== 'string' || !it.name.trim()) return { ok: false, error: `${where}: naam ontbreekt.` };
    if (!(it.amount > 0)) return { ok: false, error: `${where}: hoeveelheid ontbreekt.` };
    if (!(it.kcal >= 0)) return { ok: false, error: `${where}: kcal ontbreekt.` };
    if (it.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(it.date)) return { ok: false, error: `${where}: ongeldige datum.` };
  }
  return { ok: true, file: raw as ImportFile };
}

/** Zet een importregel om naar een product (per 100) plus de gelogde hoeveelheid. */
export function toEntries(file: ImportFile): ImportEntry[] {
  return file.items.map((it) => {
    const f = 100 / it.amount;
    const date = it.date ?? file.date;
    const food: Food = {
      id: it.summary ? `summary:${date}` : 'import:' + slug(`${it.name} ${it.brand ?? ''}`),
      name: it.name.trim(),
      brand: it.brand,
      per: {
        kcal: it.kcal * f,
        e: (it.e ?? 0) * f,
        k: (it.k ?? 0) * f,
        v: (it.v ?? 0) * f,
        fiber: it.fiber != null ? it.fiber * f : undefined,
      },
      unit: it.unit ?? 'g',
      servingG: it.portions && it.portions > 0 ? it.amount / it.portions : undefined,
      servingLabel: it.portionLabel,
      source: 'eigen',
    };
    return { date, meal: it.meal, food, grams: it.amount, summary: it.summary };
  });
}
