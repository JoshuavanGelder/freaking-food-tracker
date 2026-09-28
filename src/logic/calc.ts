// Alle rekenregels van Freaking Food Tracker op één plek, zonder React,
// zodat ze los te testen zijn (npm test).

export type Sex = 'man' | 'vrouw';

export type Profile = {
  sex: Sex;
  age: number;
  heightCm: number;
  activity: number; // activiteitsfactor, bijv. 1.375
};

export type GoalMode = 'tempo' | 'kcal';

export type MacroSplit = { e: number; k: number; v: number }; // procenten

export type Goals = {
  targetWeight: number;
  mode: GoalMode;
  paceKgPerWeek: number; // afvallen per week (negatief = aankomen)
  kcalPerDay: number;
  planId: string;
  custom: MacroSplit;
  /** Vezeldoel in gram per dag. */
  fiberGoal: number;
};

export type Per100 = {
  kcal: number;
  e: number; // eiwit
  k: number; // koolhydraten
  v: number; // vet
  fiber?: number;
  salt?: number;
  satFat?: number;
  sugar?: number;
};

export type WeightEntry = { date: string; kg: number };

export const KCAL_PER_KG = 7700;

export const ACTIVITY_LEVELS = [
  { factor: 1.2, label: 'Zittend', hint: 'Zittend werk, weinig sport' },
  { factor: 1.375, label: 'Licht actief', hint: '1–3× sport per week' },
  { factor: 1.55, label: 'Gemiddeld actief', hint: '3–5× sport per week' },
  { factor: 1.725, label: 'Zeer actief', hint: '6–7× sport per week' },
  { factor: 1.9, label: 'Extreem actief', hint: 'Fysiek werk + sport' },
];

export function activityLabel(factor: number): string {
  const hit = ACTIVITY_LEVELS.find((a) => Math.abs(a.factor - factor) < 0.001);
  return hit ? hit.label : 'Eigen factor';
}

export const MACRO_PLANS: { id: string; label: string; split: MacroSplit }[] = [
  { id: 'bal', label: 'Gebalanceerd', split: { e: 25, k: 50, v: 25 } },
  { id: 'eiwit', label: 'Eiwitrijk', split: { e: 35, k: 40, v: 25 } },
  { id: 'low', label: 'Low carb', split: { e: 30, k: 20, v: 50 } },
  { id: 'keto', label: 'Keto', split: { e: 20, k: 5, v: 75 } },
  { id: 'duur', label: 'Duursport', split: { e: 20, k: 55, v: 25 } },
  { id: 'eigen', label: 'Eigen', split: { e: 30, k: 40, v: 30 } },
];

export const DEFAULT_GOALS: Goals = {
  targetWeight: 0,
  mode: 'tempo',
  paceKgPerWeek: 0.5,
  kcalPerDay: 2000,
  planId: 'eiwit',
  custom: { e: 30, k: 40, v: 30 },
  fiberGoal: 30,
};

/** Ruststofwisseling volgens Mifflin-St Jeor. */
export function bmr(p: Profile, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'man' ? base + 5 : base - 161;
}

export function tdee(p: Profile, weightKg: number): number {
  return bmr(p, weightKg) * p.activity;
}

export type GoalResult = {
  bmr: number;
  tdee: number;
  goal: number; // kcal per dag
  deficit: number; // positief = tekort, negatief = overschot
  pace: number; // kg per week, positief = afvallen
  warnings: string[];
};

export function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

export function computeGoal(p: Profile, weightKg: number, g: Goals): GoalResult {
  const b = bmr(p, weightKg);
  const t = b * p.activity;
  let goal: number;
  let deficit: number;
  let pace: number;
  if (g.mode === 'tempo') {
    pace = g.paceKgPerWeek;
    deficit = (pace * KCAL_PER_KG) / 7;
    goal = roundTo(t - deficit, 10);
  } else {
    goal = Math.round(g.kcalPerDay);
    deficit = t - goal;
    pace = (deficit * 7) / KCAL_PER_KG;
  }
  const warnings: string[] = [];
  if (pace > weightKg * 0.01) warnings.push('Sneller dan 1% van je gewicht per week: niet aan te raden');
  const floor = p.sex === 'man' ? 1500 : 1200;
  if (goal < floor) warnings.push(`Onder ${floor.toLocaleString('nl-NL')} kcal per dag: niet aan te raden`);
  return { bmr: b, tdee: t, goal, deficit, pace, warnings };
}

export function splitFor(g: Goals): MacroSplit {
  if (g.planId === 'eigen') return g.custom;
  const plan = MACRO_PLANS.find((m) => m.id === g.planId);
  return plan ? plan.split : MACRO_PLANS[0].split;
}

export function splitTotal(s: MacroSplit): number {
  return Math.round((s.e + s.k + s.v) * 10) / 10;
}

export function macroGrams(kcal: number, s: MacroSplit): { e: number; k: number; v: number } {
  return {
    e: Math.round((kcal * s.e) / 100 / 4),
    k: Math.round((kcal * s.k) / 100 / 4),
    v: Math.round((kcal * s.v) / 100 / 9),
  };
}

/** Voedingswaarden voor een portie in gram (of ml). */
export function forGrams(per: Per100, grams: number): Per100 {
  const f = grams / 100;
  const out: Per100 = { kcal: per.kcal * f, e: per.e * f, k: per.k * f, v: per.v * f };
  if (per.fiber != null) out.fiber = per.fiber * f;
  if (per.salt != null) out.salt = per.salt * f;
  if (per.satFat != null) out.satFat = per.satFat * f;
  if (per.sugar != null) out.sugar = per.sugar * f;
  return out;
}

export function sumNutrition(items: Per100[]): Per100 {
  const s: Per100 = { kcal: 0, e: 0, k: 0, v: 0, fiber: 0, salt: 0, satFat: 0, sugar: 0 };
  for (const it of items) {
    s.kcal += it.kcal;
    s.e += it.e;
    s.k += it.k;
    s.v += it.v;
    s.fiber! += it.fiber ?? 0;
    s.salt! += it.salt ?? 0;
    s.satFat! += it.satFat ?? 0;
    s.sugar! += it.sugar ?? 0;
  }
  return s;
}

// ---------- datums (lokale tijd, als 'YYYY-MM-DD') ----------

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];

export function formatLong(key: string): string {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDate(key: string, withYear = true): string {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
}

export function formatShort(key: string): string {
  const d = parseKey(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// ---------- gewicht: trend en prognose ----------

/** Eén meting per dag (de laatste telt), gesorteerd van oud naar nieuw. */
export function dailyWeights(entries: WeightEntry[]): WeightEntry[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, e.kg);
  return [...byDay.entries()]
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 7-daags gemiddelde per meetdag: gemiddelde van de metingen in de 7 dagen t/m die dag. */
export function trendLine(entries: WeightEntry[]): WeightEntry[] {
  const days = dailyWeights(entries);
  return days.map((d) => {
    const win = days.filter((x) => {
      const diff = daysBetween(x.date, d.date);
      return diff >= 0 && diff < 7;
    });
    const avg = win.reduce((s, x) => s + x.kg, 0) / win.length;
    return { date: d.date, kg: avg };
  });
}

/** Helling van de trend in kg per dag (lineaire regressie over de laatste `windowDays`). Negatief = dalend. */
export function trendSlope(entries: WeightEntry[], windowDays = 28): number | null {
  const trend = trendLine(entries);
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1].date;
  const pts = trend.filter((t) => daysBetween(t.date, last) < windowDays);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => daysBetween(last, p.date));
  const ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Aantal dagen tot het doelgewicht bij een verandering van `kgPerDay`
 * (negatief = afvallen). Null als je de verkeerde kant op gaat of stilstaat.
 */
export function daysToTarget(current: number, target: number, kgPerDay: number): number | null {
  const need = target - current;
  if (Math.abs(need) < 0.05) return 0;
  if (kgPerDay === 0 || Math.sign(need) !== Math.sign(kgPerDay)) return null;
  const days = need / kgPerDay;
  return days > 3650 ? null : Math.ceil(days);
}

// ---------- streak ----------

/** Aantal aaneengesloten dagen met minstens één log, tot en met vandaag (of gisteren als vandaag nog leeg is). */
export function streak(loggedDays: Set<string>, today: string): number {
  let day = loggedDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (loggedDays.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// ---------- invoer ----------

/** Leest een getal zoals mensen het typen: '0,5', '1.990', '84.7'. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (t === '') return null;
  let norm: string;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, '');
  else norm = t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function nl(x: number, decimals = 0): string {
  return x.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
