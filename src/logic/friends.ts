// Samenvatting van een vriend voor de vriendenlijst: vandaag, deze week, reeks en gewichtsverloop.
// Pure functies zonder runtime-imports (zie CLAUDE.md), getest in friends.test.ts.

export type DayTotal = { date: string; kcal: number; e: number; k: number; v: number; fiber: number; items: number };
export type Weight = { date: string; kg: number };

function shift(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type FriendSummary = {
  today: DayTotal | null;
  /** Deel van het dagdoel vandaag (0–∞), null zonder doel of zonder gegevens. */
  todayPct: number | null;
  /** Gemiddelde kcal over de gelogde dagen van de afgelopen 7 dagen (vandaag meegeteld). */
  weekAvg: number | null;
  loggedThisWeek: number;
  /** Aaneengesloten dagen met eten, tot en met vandaag (of gisteren als vandaag nog leeg is). */
  streak: number;
  latestKg: number | null;
  /** Verschil tussen het laatste gewicht en het gewicht van ~7 dagen eerder. */
  weekChangeKg: number | null;
};

export function summarizeFriend(days: DayTotal[], weights: Weight[], targetKcal: number | null, today: string): FriendSummary {
  const byDate = new Map(days.filter((d) => d.items > 0).map((d) => [d.date, d]));
  const t = byDate.get(today) ?? null;
  const week = Array.from({ length: 7 }, (_, i) => byDate.get(shift(today, -i))).filter((d): d is DayTotal => !!d);
  const weekAvg = week.length ? week.reduce((s, d) => s + d.kcal, 0) / week.length : null;

  let streak = 0;
  let d = byDate.has(today) ? today : shift(today, -1);
  while (byDate.has(d)) {
    streak++;
    d = shift(d, -1);
  }

  const ws = [...weights].filter((w) => w.kg > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const latest = ws.length ? ws[ws.length - 1] : null;
  let weekChangeKg: number | null = null;
  if (latest) {
    const ref = shift(latest.date, -7);
    // het gewicht dat het dichtst bij een week eerder ligt (tussen 4 en 14 dagen terug)
    const candidates = ws.filter((w) => w.date <= shift(latest.date, -4) && w.date >= shift(latest.date, -14));
    if (candidates.length) {
      const dist = (w: Weight) => Math.abs(Date.parse(w.date) - Date.parse(ref));
      const base = candidates.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      weekChangeKg = Math.round((latest.kg - base.kg) * 10) / 10;
    }
  }

  return {
    today: t,
    todayPct: t && targetKcal && targetKcal > 0 ? t.kcal / targetKcal : null,
    weekAvg: weekAvg != null ? Math.round(weekAvg) : null,
    loggedThisWeek: week.length,
    streak,
    latestKg: latest ? latest.kg : null,
    weekChangeKg,
  };
}

/** Vriendcode leesbaar maken: "a1b2c3d4" → "a1b2 c3d4". */
export function formatCode(code: string): string {
  const c = code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

/** Invoer van een code opschonen; geldig = 8 tekens 0-9a-f. */
export function cleanCode(input: string): string | null {
  const c = input.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return /^[0-9a-f]{8}$/.test(c) ? c : null;
}
