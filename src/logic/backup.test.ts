import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupSummary, mergeBackup, parseBackup } from './backup.ts';
import type { BackupState } from './backup.ts';
import { buildExport, exportToText } from './exporter.ts';
import type { Food } from './off.ts';

const kwark: Food = { id: 'off:1', name: 'Magere kwark', brand: 'AH', per: { kcal: 52, e: 9, k: 4, v: 0.2 }, source: 'off' };
const soep: Food = { id: 'eigen:3', name: 'Soep van mama', per: { kcal: 40, e: 2, k: 5, v: 1 }, source: 'eigen', unit: 'ml' };
const brood: Food = { id: 'nevo:2', name: 'Volkorenbrood', per: { kcal: 220, e: 9, k: 38, v: 2, micro: { fe: 2.5 } }, source: 'nevo' };

const goals = { targetWeight: 80, mode: 'tempo' as const, paceKgPerWeek: 0.5, kcalPerDay: 2000, planId: 'eiwit', custom: { e: 30, k: 40, v: 30 }, fiberGoal: 30 };

function state(over: Partial<BackupState> = {}): BackupState {
  return {
    version: 1,
    profile: { sex: 'man', age: 30, heightCm: 180, activity: 1.375 } as any,
    goals: goals as any,
    log: [],
    weights: [],
    foods: {},
    favorites: [],
    recent: [],
    lastPortion: {},
    favMeals: [],
    imports: [],
    ...over,
  };
}

const full = state({
  log: [
    { id: 'a', date: '2026-10-01', meal: 'ontbijt', food: kwark, grams: 250 },
    { id: 'b', date: '2026-10-02', meal: 'diner', food: soep, grams: 300 },
    { id: 'c', date: '2026-10-02', meal: 'lunch', food: brood, grams: 80 },
  ],
  weights: [
    { date: '2026-10-01', kg: 90.5 },
    { date: '2026-10-02', kg: 90.2 },
  ],
  foods: { [kwark.id]: kwark, [soep.id]: soep, [brood.id]: brood },
  favorites: [kwark.id],
  recent: [brood.id, soep.id, kwark.id],
  lastPortion: { [kwark.id]: 250 },
  favMeals: [{ id: 'm1', name: 'Ontbijt', items: [{ food: kwark, grams: 250 }] }],
  imports: ['foodvisor-week'],
});

function exportText(s: BackupState, scope: 'all' | 'week' = 'all', withBackup = true) {
  return exportToText(buildExport(scope, '2026-10-03', '2026-10-03T14:00:00.000Z', s as any, withBackup ? s : undefined));
}

test('export "Alles" bevat de volledige reservekopie en die komt ongewijzigd terug', () => {
  const r = parseBackup(exportText(full));
  assert.ok(r.ok);
  assert.deepEqual(r.backup.state, full);
  assert.equal(r.backup.skipped, 0);
  assert.equal(r.backup.exportedAt, '2026-10-03T14:00:00.000Z');
});

test('week-export of oude export zonder reservekopie geeft een duidelijke melding', () => {
  const week = parseBackup(exportText(full, 'week'));
  assert.ok(!week.ok && 'error' in week && /één week/.test(week.error));
  const old = parseBackup(exportText(full, 'all', false));
  assert.ok(!old.ok && 'error' in old && /nieuwe export/.test(old.error));
});

test('geen export (bijv. Foodvisor-importtekst of rommel) wordt herkend als "geen export"', () => {
  for (const t of ['{"type":"fft-import","v":1}', 'hallo', '']) {
    const r = parseBackup(t);
    assert.ok(!r.ok && 'notExport' in r);
  }
});

test('kapotte regels worden overgeslagen en geteld', () => {
  const data = JSON.parse(exportText(full));
  data.backup.log.push({ id: 'x', date: 'gisteren', meal: 'lunch', food: kwark, grams: 10 });
  data.backup.weights.push({ date: '2026-10-03', kg: -1 });
  const r = parseBackup(JSON.stringify(data));
  assert.ok(r.ok);
  assert.equal(r.backup.state.log.length, 3);
  assert.equal(r.backup.skipped, 2);
});

test('terugzetten op een lege telefoon zet alles terug', () => {
  const empty = state({ profile: null });
  const { state: s, added } = mergeBackup(empty, full, true);
  assert.deepEqual(s.log, full.log);
  assert.deepEqual(s.weights, full.weights);
  assert.deepEqual(s.foods, full.foods);
  assert.deepEqual(s.favorites, full.favorites);
  assert.deepEqual(s.favMeals, full.favMeals);
  assert.deepEqual(s.profile, full.profile);
  assert.deepEqual(added, { entries: 3, days: 2, weights: 2, foods: 3, favMeals: 1, favorites: 1 });
});

test('terugzetten voegt samen: bestaande gegevens blijven, dubbelen komen er niet bij', () => {
  const now = state({
    profile: { sex: 'man', age: 31, heightCm: 180, activity: 1.55 } as any,
    log: [
      { id: 'a', date: '2026-10-01', meal: 'ontbijt', food: kwark, grams: 200 }, // zelfde id, nu 200 g
      { id: 'n', date: '2026-10-03', meal: 'lunch', food: brood, grams: 100 },
    ],
    weights: [{ date: '2026-10-02', kg: 89.9 }],
    foods: { [kwark.id]: { ...kwark, name: 'Kwark (aangepast)' }, [brood.id]: brood },
    favMeals: [{ id: 'eigen', name: 'Mijn ontbijt', items: [{ food: kwark, grams: 250 }] }], // zelfde inhoud als m1
    lastPortion: { [kwark.id]: 200 },
  });
  const { state: s, added } = mergeBackup(now, full, false);
  assert.equal(s.log.length, 4);
  assert.equal(s.log.find((e) => e.id === 'a')!.grams, 200);
  assert.deepEqual(
    s.weights.map((w) => [w.date, w.kg]),
    [
      ['2026-10-02', 89.9],
      ['2026-10-01', 90.5],
    ],
  );
  assert.equal(s.foods[kwark.id].name, 'Kwark (aangepast)');
  assert.ok(s.foods[soep.id]);
  assert.equal(s.favMeals.length, 1);
  assert.equal(s.lastPortion[kwark.id], 200);
  assert.equal((s.profile as any).age, 31, 'profiel blijft als withProfile uit staat');
  assert.deepEqual(added, { entries: 2, days: 1, weights: 1, foods: 1, favMeals: 0, favorites: 1 });
});

test('nog een keer terugzetten voegt niets meer toe', () => {
  const once = mergeBackup(state({ profile: null }), full, true).state;
  const twice = mergeBackup(once, full, true);
  assert.deepEqual(twice.added, { entries: 0, days: 0, weights: 0, foods: 0, favMeals: 0, favorites: 0 });
  assert.equal(twice.state.log.length, 3);
});

test('backupSummary telt dagen, eigen producten en periode', () => {
  assert.deepEqual(backupSummary(full), {
    days: 2,
    entries: 3,
    weights: 2,
    ownFoods: 1,
    favMeals: 1,
    favorites: 1,
    from: '2026-10-01',
    to: '2026-10-02',
  });
});
