// Laadt de meegeleverde NEVO-gegevens (gemaakt met scripts/nevo-convert.py).
import raw from './nevo.json';
import type { NevoData } from '../logic/nevo';

export const NEVO = raw as unknown as NevoData;
