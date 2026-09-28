// Laadt de meegeleverde NEVO-gegevens (gemaakt met scripts/nevo-convert.py).
import raw from './nevo.json';
import { nevoToFood } from '../logic/nevo';
import type { NevoData, NevoItem } from '../logic/nevo';
import type { Food } from '../logic/off';

export const NEVO = raw as unknown as NevoData;

let byCode: Map<number, NevoItem> | null = null;

/**
 * Vult een NEVO-product aan met de nieuwste gegevens uit de app, bijv. de micro's
 * voor producten die al gelogd waren voordat de app die kende.
 */
export function withNevoData(food: Food): Food {
  if (food.source !== 'nevo' || food.per.micro) return food;
  byCode ??= new Map(NEVO.items.map((i) => [i[0], i]));
  const item = byCode.get(Number(food.id.slice(5)));
  return item ? { ...food, per: nevoToFood(item).per } : food;
}
