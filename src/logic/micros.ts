// Vitamines en mineralen: welke we bijhouden, de normen en de dagtotalen.
// Normen: Gezondheidsraad, Voedingsnormen voor vitamines en mineralen voor volwassenen (2018),
// aanbevolen hoeveelheid (ADH) of adequate inname (AI), volwassenen 18-50 jaar.
// Zout: Richtlijnen goede voeding 2015 (max. 6 g). Verzadigd vet: max. 10% van de energie.

import type { Per100, Profile } from './calc';

export type MicroKey =
  | 'vitA' | 'vitB2' | 'vitB6' | 'vitB12' | 'folate' | 'vitC' | 'vitD' | 'vitE'
  | 'ca' | 'fe' | 'mg' | 'kal' | 'zn' | 'iod' | 'se' | 'na';

export type Micros = Partial<Record<MicroKey, number>>;

/** Vaste volgorde; zo staan ze ook in nevo.json (en in scripts/nevo-convert.py). */
export const MICRO_KEYS: MicroKey[] = [
  'vitA', 'vitB2', 'vitB6', 'vitB12', 'folate', 'vitC', 'vitD', 'vitE',
  'ca', 'fe', 'mg', 'kal', 'zn', 'iod', 'se', 'na',
];

export type MicroInfo = {
  key: MicroKey;
  label: string;
  unit: 'mg' | 'µg';
  group: 'vitamine' | 'mineraal';
  /** Waar het vooral voor dient, één regel. */
  why: string;
};

export const MICROS: MicroInfo[] = [
  { key: 'vitA', label: 'Vitamine A', unit: 'µg', group: 'vitamine', why: 'Ogen, huid en afweer' },
  { key: 'vitB2', label: 'Vitamine B2', unit: 'mg', group: 'vitamine', why: 'Energie uit voeding' },
  { key: 'vitB6', label: 'Vitamine B6', unit: 'mg', group: 'vitamine', why: 'Eiwitstofwisseling' },
  { key: 'vitB12', label: 'Vitamine B12', unit: 'µg', group: 'vitamine', why: 'Bloed en zenuwen; vooral in dierlijke producten' },
  { key: 'folate', label: 'Foliumzuur', unit: 'µg', group: 'vitamine', why: 'Celdeling en bloed' },
  { key: 'vitC', label: 'Vitamine C', unit: 'mg', group: 'vitamine', why: 'Afweer; helpt ijzer opnemen' },
  { key: 'vitD', label: 'Vitamine D', unit: 'µg', group: 'vitamine', why: 'Botten; komt ook uit zonlicht' },
  { key: 'vitE', label: 'Vitamine E', unit: 'mg', group: 'vitamine', why: 'Beschermt cellen' },
  { key: 'ca', label: 'Calcium', unit: 'mg', group: 'mineraal', why: 'Botten en tanden' },
  { key: 'fe', label: 'IJzer', unit: 'mg', group: 'mineraal', why: 'Zuurstoftransport in het bloed' },
  { key: 'mg', label: 'Magnesium', unit: 'mg', group: 'mineraal', why: 'Spieren en zenuwen' },
  { key: 'kal', label: 'Kalium', unit: 'mg', group: 'mineraal', why: 'Bloeddruk; tegenhanger van zout' },
  { key: 'zn', label: 'Zink', unit: 'mg', group: 'mineraal', why: 'Afweer en wondherstel' },
  { key: 'iod', label: 'Jodium', unit: 'µg', group: 'mineraal', why: 'Schildklier; vooral uit brood en zout' },
  { key: 'se', label: 'Selenium', unit: 'µg', group: 'mineraal', why: 'Beschermt cellen' },
  { key: 'na', label: 'Natrium', unit: 'mg', group: 'mineraal', why: 'Zit in zout' },
];

export const MICRO_BY_KEY = Object.fromEntries(MICROS.map((m) => [m.key, m])) as Record<MicroKey, MicroInfo>;

/** Dagnorm voor iemand; `null` als er geen norm is (natrium: zie zout). */
export function microTarget(key: MicroKey, p: Pick<Profile, 'sex' | 'age'> | null): number | null {
  const man = p?.sex !== 'vrouw';
  const age = p?.age ?? 30;
  switch (key) {
    case 'vitA': return man ? 800 : 680;
    case 'vitB2': return 1.6;
    case 'vitB6': return 1.5;
    case 'vitB12': return 2.8;
    case 'folate': return 300;
    case 'vitC': return 75;
    case 'vitD': return age >= 70 ? 20 : 10;
    case 'vitE': return man ? 13 : 11;
    case 'ca': return age < 25 ? 1000 : 950;
    case 'fe': return man || age >= 51 ? 11 : 16;
    case 'mg': return man ? 350 : 300;
    case 'kal': return 3500;
    case 'zn': return man ? 9 : 7;
    case 'iod': return 150;
    case 'se': return 70;
    case 'na': return null;
  }
}

export const SALT_MAX = 6;

/** Zout in gram per 100: van het etiket, of berekend uit natrium (× 2,5). */
export function saltOf(per: Per100): number | undefined {
  if (per.salt != null) return per.salt;
  const na = per.micro?.na;
  return na != null ? (na * 2.5) / 1000 : undefined;
}

export type MicroItem = { name: string; per: Per100; grams: number };

export type NutrientTotal = {
  /** Totaal (alleen van producten waarvan de waarde bekend is). */
  amount: number;
  /** Deel van de kcal waarvoor de waarde bekend is (0-1). */
  known: number;
  /** Grootste bronnen, hoogste eerst. */
  top: { name: string; amount: number }[];
};

export type MicroSummary = {
  kcal: number;
  days: number;
  micro: Record<MicroKey, NutrientTotal>;
  salt: NutrientTotal;
  satFat: NutrientTotal;
  sugar: NutrientTotal;
  /** Deel van de kcal met ten minste één vitamine of mineraal (behalve natrium). */
  anyKnown: number;
};

/**
 * Telt de micro's op. Met `days` > 1 is alles een gemiddelde per dag.
 * Producten zonder een bepaalde waarde tellen niet mee; `known` zegt hoeveel van de kcal dat dekt.
 */
export function summarizeMicros(items: MicroItem[], days = 1): MicroSummary {
  const d = Math.max(1, days);
  const kcal = items.reduce((s, i) => s + (i.per.kcal * i.grams) / 100, 0);
  const total = (get: (per: Per100) => number | undefined): NutrientTotal => {
    let amount = 0;
    let knownKcal = 0;
    const by = new Map<string, number>();
    for (const i of items) {
      const v = get(i.per);
      if (v == null) continue;
      const a = (v * i.grams) / 100;
      amount += a;
      knownKcal += (i.per.kcal * i.grams) / 100;
      by.set(i.name, (by.get(i.name) ?? 0) + a);
    }
    const top = [...by.entries()]
      .filter(([, a]) => a > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([name, a]) => ({ name, amount: a / d }));
    return { amount: amount / d, known: kcal > 0 ? knownKcal / kcal : 0, top };
  };
  const micro = {} as Record<MicroKey, NutrientTotal>;
  for (const k of MICRO_KEYS) micro[k] = total((p) => p.micro?.[k]);
  const anyKcal = items
    .filter((i) => i.per.micro && MICRO_KEYS.some((k) => k !== 'na' && i.per.micro![k] != null))
    .reduce((s, i) => s + (i.per.kcal * i.grams) / 100, 0);
  return {
    kcal: kcal / d,
    days: d,
    micro,
    salt: total(saltOf),
    satFat: total((p) => p.satFat),
    sugar: total((p) => p.sugar),
    anyKnown: kcal > 0 ? anyKcal / kcal : 0,
  };
}

/** Maximaal verzadigd vet in gram: 10% van de energie. */
export function satFatMax(kcal: number): number {
  return (kcal * 0.1) / 9;
}
