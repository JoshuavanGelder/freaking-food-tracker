import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFromDay, itemsToAdd, kcalOf, markDone, offerFor, parseDefaults, shiftDay, suggestionFor, weekdayName, weekdayOf } from './dayplan.ts';
import type { DefaultItem } from './dayplan.ts';
import type { Food } from './off.ts';

const kwark: Food = { id: 'off:1', name: 'Magere kwark', per: { kcal: 52, e: 9, k: 4, v: 0.2 }, source: 'off' };
const brood: Food = { id: 'nevo:2', name: 'Volkorenbrood', per: { kcal: 220, e: 9, k: 38, v: 2 }, source: 'nevo' };

// 2026-10-19 is een maandag
const MON = '2026-10-19';
const lastMon = '2026-10-12';

const log = [
  { id: 'a', date: lastMon, meal: 'ontbijt' as const, food: kwark, grams: 250 },
  { id: 'b', date: lastMon, meal: 'lunch' as const, food: brood, grams: 80 },
  { id: 'c', date: '2026-10-13', meal: 'lunch' as const, food: brood, grams: 100 },
];

test('weekdag en datum verschuiven', () => {
  assert.equal(weekdayOf(MON), 1);
  assert.equal(weekdayName(MON), 'maandag');
  assert.equal(shiftDay(MON, -7), lastMon);
  assert.equal(shiftDay('2026-10-30', 3), '2026-11-02');
  assert.equal(shiftDay('2026-03-28', 1), '2026-03-29'); // zomertijd
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
});

test('zonder standaard: de dag van vorige week wordt voorgesteld', () => {
  const s = suggestionFor(MON, log, {});
  assert.equal(s?.source, 'lastWeek');
  assert.equal(s?.from, lastMon);
  assert.equal(s?.items.length, 2);
  assert.deepEqual(s?.items[0], { meal: 'ontbijt', food: kwark, grams: 250 });
});

test('met een standaard voor die weekdag wint de standaard', () => {
  const own: DefaultItem[] = [{ meal: 'diner', food: brood, grams: 150 }];
  const s = suggestionFor(MON, log, { '1': own });
  assert.equal(s?.source, 'default');
  assert.deepEqual(s?.items, own);
  // een standaard voor een andere weekdag telt niet
  assert.equal(suggestionFor(MON, log, { '2': own })?.source, 'lastWeek');
});

test('geen standaard en niets vorige week: geen voorstel', () => {
  assert.equal(suggestionFor('2026-10-21', log, {}), null);
  assert.equal(offerFor('2026-10-21', log, {}, []), null);
});

test('een lege standaard telt als geen standaard', () => {
  assert.equal(suggestionFor(MON, log, { '1': [] })?.source, 'lastWeek');
});

test('alleen lege maaltijden worden aangevuld', () => {
  const items: DefaultItem[] = [
    { meal: 'ontbijt', food: kwark, grams: 250 },
    { meal: 'lunch', food: brood, grams: 80 },
  ];
  assert.deepEqual(itemsToAdd(items, [{ meal: 'ontbijt' }]).map((i) => i.meal), ['lunch']);
  assert.equal(itemsToAdd(items, [{ meal: 'ontbijt' }, { meal: 'lunch' }]).length, 0);
});

test('offerFor: pas na accepteren of overslaan verdwijnt het voorstel', () => {
  assert.equal(offerFor(MON, log, {}, [])?.items.length, 2);
  assert.equal(offerFor(MON, log, {}, [MON]), null);
  assert.equal(offerFor(MON, log, {}, ['2026-10-18'])?.items.length, 2);
});

test('offerFor: niets te doen als de maaltijden al gevuld zijn', () => {
  const today = [...log, { id: 'x', date: MON, meal: 'ontbijt' as const, food: brood, grams: 50 }, { id: 'y', date: MON, meal: 'lunch' as const, food: brood, grams: 50 }];
  assert.equal(offerFor(MON, today, {}, []), null);
  const partly = offerFor(MON, today.slice(0, 4), {}, []);
  assert.deepEqual(partly?.items.map((i) => i.meal), ['lunch']);
});

test('defaultFromDay neemt de hele dag over', () => {
  const d = defaultFromDay(lastMon, log);
  assert.equal(d.length, 2);
  assert.equal(Math.round(kcalOf(d)), Math.round((52 * 250) / 100 + (220 * 80) / 100));
});

test('markDone voegt toe, ontdubbelt en ruimt oude dagen op', () => {
  const r = markDone(['2020-01-01', MON], MON, MON);
  assert.deepEqual(r, [MON]);
  assert.deepEqual(markDone(undefined, '2026-10-21', MON), ['2026-10-21']);
});

test('parseDefaults laat alleen geldige weekdagen en regels door', () => {
  const ok = { meal: 'lunch', food: brood, grams: 80 };
  const r = parseDefaults({ '1': [ok, { meal: 'nacht', food: brood, grams: 5 }, { meal: 'lunch', food: brood, grams: 0 }], '9': [ok], x: [ok], '2': 'kapot' });
  assert.deepEqual(Object.keys(r), ['1']);
  assert.equal(r['1'].length, 1);
  assert.deepEqual(parseDefaults(null), {});
});
