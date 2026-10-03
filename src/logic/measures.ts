// Keukenmaten (theelepel, eetlepel, glas, ...) naast de gewone porties.
// De standaardgroottes gelden voor water; bij vaste producten verschilt het (1 el suiker ≈ 12 g, 1 el honing ≈ 21 g).
// Daarom kun je de grootte per product aanpassen; de app onthoudt dat in `Food.measures`.
// Pure functies zonder runtime-imports (zie CLAUDE.md), getest in measures.test.ts.

import type { Unit } from './off';

export type MeasureId = 'tl' | 'dl' | 'el' | 'kopje' | 'glas' | 'mok';
export type Measure = { id: MeasureId; label: string; plural: string; size: number };

const ALL: Measure[] = [
  { id: 'tl', label: 'Theelepel', plural: 'theelepels', size: 5 },
  { id: 'dl', label: 'Dessertlepel', plural: 'dessertlepels', size: 10 },
  { id: 'el', label: 'Eetlepel', plural: 'eetlepels', size: 15 },
  { id: 'kopje', label: 'Kopje', plural: 'kopjes', size: 125 },
  { id: 'glas', label: 'Glas', plural: 'glazen', size: 200 },
  { id: 'mok', label: 'Mok', plural: 'mokken', size: 250 },
];

const SPOONS: MeasureId[] = ['tl', 'dl', 'el'];

/** De maten die bij een eenheid horen: lepels voor alles, kopje/glas/mok alleen voor dranken en andere vloeistoffen. */
export function measuresFor(unit: Unit): Measure[] {
  return ALL.filter((m) => unit === 'ml' || SPOONS.includes(m.id));
}

export const measureById = (id: MeasureId | string): Measure | undefined => ALL.find((m) => m.id === id);

/** Grootte van een maat voor dit product: je eigen waarde als die er is, anders de standaard. */
export function measureSize(m: Measure, own?: Record<string, number> | null): number {
  const v = own?.[m.id];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000 ? v : m.size;
}

/** Eigen maten uit de cloud of een reservekopie opschonen; onbekende maten en rare waarden vallen weg. */
export function cleanMeasures(x: unknown): Record<string, number> | undefined {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const out: Record<string, number> = {};
  for (const m of ALL) {
    const v = (x as Record<string, unknown>)[m.id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000) out[m.id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Aantal maten als de hoeveelheid een veelvoud van een halve maat is, anders null. */
export function measureCount(amount: number, size: number): number | null {
  if (!(size > 0) || !(amount > 0)) return null;
  const ratio = amount / size;
  const half = Math.round(ratio * 2) / 2;
  return half > 0 && Math.abs(ratio - half) < 0.01 ? half : null;
}

/** Nieuwe eigen maten na het opslaan: alleen bijwerken als de grootte afwijkt van wat er al gold. */
export function withMeasure(
  own: Record<string, number> | undefined,
  m: Measure,
  size: number,
): Record<string, number> | undefined {
  if (Math.abs(size - measureSize(m, own)) < 0.001) return own;
  const next = { ...(own ?? {}) };
  if (Math.abs(size - m.size) < 0.001) delete next[m.id];
  else next[m.id] = size;
  return Object.keys(next).length ? next : undefined;
}
