import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, formatCode, summarizeFriend } from './friends.ts';
import type { DayTotal } from './friends.ts';

const day = (date: string, kcal: number, items = 3): DayTotal => ({ date, kcal, e: 0, k: 0, v: 0, fiber: 0, items });

test('vandaag, weekgemiddelde en reeks', () => {
  const s = summarizeFriend(
    [day('2026-10-03', 1500), day('2026-10-02', 2100), day('2026-10-01', 1800), day('2026-09-28', 2000), day('2026-09-26', 9999)],
    [],
    2000,
    '2026-10-03',
  );
  assert.equal(s.today?.kcal, 1500);
  assert.equal(s.todayPct, 0.75);
  assert.equal(s.loggedThisWeek, 4); // 26 sep valt buiten de 7 dagen
  assert.equal(s.weekAvg, Math.round((1500 + 2100 + 1800 + 2000) / 4));
  assert.equal(s.streak, 3);
});

test('reeks telt door vanaf gisteren als vandaag nog leeg is; lege dagen tellen niet', () => {
  const s = summarizeFriend([day('2026-10-02', 2000), day('2026-10-01', 1900), day('2026-10-03', 0, 0)], [], null, '2026-10-03');
  assert.equal(s.today, null);
  assert.equal(s.todayPct, null);
  assert.equal(s.streak, 2);
});

test('gewichtsverloop: verschil met ongeveer een week eerder', () => {
  const s = summarizeFriend(
    [],
    [
      { date: '2026-09-20', kg: 92 },
      { date: '2026-09-26', kg: 91.2 },
      { date: '2026-10-03', kg: 90.5 },
    ],
    null,
    '2026-10-03',
  );
  assert.equal(s.latestKg, 90.5);
  assert.equal(s.weekChangeKg, -0.7);
  // alleen een recent gewicht: geen verschil
  assert.equal(summarizeFriend([], [{ date: '2026-10-03', kg: 90 }, { date: '2026-10-02', kg: 90.4 }], null, '2026-10-03').weekChangeKg, null);
});

test('vriendcode opmaken en controleren', () => {
  assert.equal(formatCode('a1b2c3d4'), 'a1b2 c3d4');
  assert.equal(cleanCode(' A1B2 c3d4 '), 'a1b2c3d4');
  assert.equal(cleanCode('a1b2-c3d4'), 'a1b2c3d4');
  assert.equal(cleanCode('xyz'), null);
  assert.equal(cleanCode('g1b2c3d4'), null);
});
