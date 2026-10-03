import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, exportFileName, exportRange, exportToText, shiftDay } from './exporter.ts';
import type { ExportInput } from './exporter.ts';
import type { Food } from './off.ts';

const kwark: Food = { id: 'off:1', name: 'Magere kwark', brand: 'AH', per: { kcal: 52, e: 9, k: 4, v: 0.2, fiber: 0, salt: 0.1 }, source: 'off' };
const brood: Food = {
  id: 'nevo:2',
  name: 'Volkorenbrood',
  per: { kcal: 220, e: 9, k: 38, v: 2, fiber: 6, micro: { fe: 2.5, ca: 40 } },
  source: 'nevo',
};
const eigen: Food = { id: 'eigen:3', name: 'Soep van mama', per: { kcal: 40, e: 2, k: 5, v: 1 }, source: 'eigen', unit: 'ml' };
const dag: Food = { id: 'summary:2026-09-22', name: 'Dagtotaal', per: { kcal: 100, e: 5, k: 10, v: 3 }, source: 'eigen' };

const input: ExportInput = {
  profile: { sex: 'man', age: 30, heightCm: 180, activity: 1.375 },
  goals: { targetWeight: 80, mode: 'tempo', paceKgPerWeek: 0.5, kcalPerDay: 2000, planId: 'eiwit', custom: { e: 30, k: 40, v: 30 }, fiberGoal: 30 },
  log: [
    { date: '2026-10-03', meal: 'lunch', food: brood, grams: 100 },
    { date: '2026-10-03', meal: 'ontbijt', food: kwark, grams: 250 },
    { date: '2026-09-30', meal: 'diner', food: eigen, grams: 300 },
    { date: '2026-09-27', meal: 'snacks', food: kwark, grams: 100 }, // 6 dagen terug = nog binnen de week
    { date: '2026-09-26', meal: 'snacks', food: kwark, grams: 100 }, // 7 dagen terug = erbuiten
    { date: '2026-09-22', meal: 'lunch', food: dag, grams: 1 },
  ],
  weights: [
    { date: '2026-10-02', kg: 90.5 },
    { date: '2026-09-20', kg: 92 },
  ],
  foods: { [kwark.id]: kwark, [brood.id]: brood, [eigen.id]: eigen },
  favorites: ['off:1', 'weg:0'],
  favMeals: [{ name: 'Standaard ontbijt', items: [{ food: kwark, grams: 250 }] }],
};

const TODAY = '2026-10-03';
const NOW = '2026-10-03T14:42:00.000Z';

test('shiftDay rekent over maand- en jaargrenzen', () => {
  assert.equal(shiftDay('2026-10-03', -6), '2026-09-27');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('deze week = de afgelopen 7 dagen, vandaag meegeteld', () => {
  assert.deepEqual(exportRange('week', TODAY, input), { from: '2026-09-27', to: '2026-10-03' });
  const out: any = buildExport('week', TODAY, NOW, input);
  assert.equal(out.days.length, 7);
  assert.equal(out.days[0].date, '2026-09-27');
  assert.equal(out.days[6].date, '2026-10-03');
  // 26 sep valt erbuiten, 22 sep (dagtotaal) ook
  assert.equal(out.days.reduce((s: number, d: any) => s + d.entries.length, 0), 4);
  assert.equal(out.days[1].logged, false); // 28 sep: niets gelogd, wel in de lijst
  assert.deepEqual(out.weights, [{ date: '2026-10-02', kg: 90.5 }]);
  assert.equal(out.ownProducts, undefined); // alleen bij 'alles'
});

test('dag: maaltijden op volgorde en totalen op de gelogde hoeveelheid', () => {
  const out: any = buildExport('week', TODAY, NOW, input);
  const d = out.days[6];
  assert.deepEqual(d.entries.map((e: any) => e.meal), ['ontbijt', 'lunch']);
  assert.equal(d.entries[0].name, 'Magere kwark');
  assert.equal(d.entries[0].brand, 'AH');
  assert.equal(d.entries[0].amount, 250);
  assert.equal(d.entries[0].kcal, 130);
  assert.equal(d.entries[0].e, 22.5);
  assert.equal(d.entries[0].salt, 0.25);
  assert.equal(d.entries[1].micro.fe, 2.5);
  assert.equal(d.totals.kcal, 350);
  assert.equal(d.totals.fiber, 6); // kwark heeft 0, brood 6
  assert.deepEqual(d.totals.micro, { fe: 2.5, ca: 40 });
});

test('onbekende waarden ontbreken in plaats van 0 te zijn', () => {
  const out: any = buildExport('week', TODAY, NOW, input);
  const soep = out.days[3].entries[0]; // 30 sep
  assert.equal(soep.unit, 'ml');
  assert.equal(soep.fiber, undefined);
  assert.equal(soep.micro, undefined);
  assert.equal(out.days[3].totals.fiber, undefined);
});

test('alles: alle dagen met eten, plus eigen producten, favorieten en favoriete maaltijden', () => {
  assert.deepEqual(exportRange('all', TODAY, input), { from: '2026-09-20', to: TODAY });
  const out: any = buildExport('all', TODAY, NOW, input);
  assert.deepEqual(out.days.map((d: any) => d.date), ['2026-09-22', '2026-09-26', '2026-09-27', '2026-09-30', '2026-10-03']);
  assert.equal(out.days[0].entries[0].summary, true);
  assert.equal(out.weights.length, 2);
  assert.deepEqual(out.ownProducts.map((f: any) => f.id), ['eigen:3']);
  assert.deepEqual(out.favoriteProducts.map((f: any) => f.id), ['off:1']); // onbekende id wordt overgeslagen
  assert.equal(out.favoriteMeals[0].name, 'Standaard ontbijt');
  assert.equal(out.favoriteMeals[0].items[0].kcal, 130);
});

test('alles zonder gegevens geeft een lege maar geldige export', () => {
  const empty: ExportInput = { ...input, log: [], weights: [], foods: {}, favorites: [], favMeals: [] };
  assert.equal(exportRange('all', TODAY, empty), null);
  const out: any = buildExport('all', TODAY, NOW, empty);
  assert.equal(out.days.length, 0);
  assert.equal(out.type, 'fft-export');
  assert.doesNotThrow(() => JSON.parse(exportToText(out)));
});

test('bestandsnamen', () => {
  assert.equal(exportFileName('week', TODAY, '2026-09-27'), 'freaking-food-tracker-week-2026-09-27_2026-10-03.json');
  assert.equal(exportFileName('all', TODAY, '2026-09-20'), 'freaking-food-tracker-alles-2026-10-03.json');
});
