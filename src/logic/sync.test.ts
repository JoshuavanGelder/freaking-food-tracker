import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SNAPSHOT, afterPush, applyPull, entryHash, hashText, isEmptyPlan, planPush, stableStringify } from './sync.ts';
import type { Remote, SyncState } from './sync.ts';
import type { Food } from './off.ts';

const kwark: Food = { id: 'off:1', name: 'Magere kwark', per: { kcal: 52, e: 9, k: 4, v: 0.2 }, source: 'off' };
const brood: Food = { id: 'nevo:2', name: 'Volkorenbrood', per: { kcal: 220, e: 9, k: 38, v: 2 }, source: 'nevo' };
const goals = { targetWeight: 80, mode: 'tempo', paceKgPerWeek: 0.5, kcalPerDay: 2000, planId: 'eiwit', custom: { e: 30, k: 40, v: 30 }, fiberGoal: 30 } as any;
const profile = { sex: 'man', age: 30, heightCm: 180, activity: 1.375 } as any;

function st(over: Partial<SyncState> = {}): SyncState {
  return { profile, goals, log: [], weights: [], foods: {}, favorites: [], recent: [], lastPortion: {}, favMeals: [], imports: [], ...over };
}
const none: Remote = { entries: [], weights: [], meta: null, library: null };

const phone = st({
  log: [
    { id: 'a', date: '2026-10-01', meal: 'ontbijt', food: kwark, grams: 250 },
    { id: 'b', date: '2026-10-02', meal: 'lunch', food: brood, grams: 80 },
  ],
  weights: [{ date: '2026-10-01', kg: 90.5 }],
  foods: { [kwark.id]: kwark, [brood.id]: brood },
  favorites: [kwark.id],
});

test('stableStringify negeert de volgorde van sleutels', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } }), stableStringify({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 }));
  assert.notEqual(hashText('abc'), hashText('abd'));
});

test('eerste push stuurt alles van de telefoon omhoog', () => {
  const p = planPush(phone, EMPTY_SNAPSHOT, 'Joshua', 1000);
  assert.equal(p.upsertEntries.length, 2);
  assert.equal(p.upsertWeights.length, 1);
  assert.ok(p.meta && p.meta.name === 'Joshua');
  assert.ok(p.library && p.library.favorites[0] === kwark.id);
  const snap = afterPush(EMPTY_SNAPSHOT, p);
  assert.ok(isEmptyPlan(planPush(phone, snap, 'Joshua', 2000)), 'daarna is er niets meer te sturen');
});

test('wijzigen en verwijderen worden herkend', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const changed = { ...phone, log: [{ ...phone.log[0], grams: 200 }], weights: [] };
  const p = planPush(changed, snap, '', 2000);
  assert.deepEqual(p.upsertEntries.map((e) => [e.id, e.grams]), [['a', 200]]);
  assert.deepEqual(p.deleteEntries, ['b']);
  assert.deepEqual(p.deleteWeights, ['2026-10-01']);
  assert.equal(p.meta, null);
  const after = afterPush(snap, p);
  assert.equal(after.entries.b, undefined);
  assert.ok(isEmptyPlan(planPush(changed, after, '', 3000)));
});

test('zonder profiel (onboarding) gaat er geen meta omhoog', () => {
  const p = planPush(st({ profile: null }), EMPTY_SNAPSHOT, '', 1000);
  assert.equal(p.meta, null);
});

test('nieuwe telefoon: alles komt van de server, profiel inbegrepen', () => {
  const fresh = st({ profile: null });
  const remote: Remote = {
    entries: phone.log.map((e) => ({ ...e, deleted: false, updated_ms: 1000 })),
    weights: [{ date: '2026-10-01', kg: 90.5, deleted: false, updated_ms: 1000 }],
    meta: { profile, goals, prefs: { recent: ['nevo:2'], lastPortion: { 'off:1': 250 } }, name: 'Joshua', updated_ms: 1000 },
    library: { data: { foods: phone.foods, favorites: phone.favorites, favMeals: [], imports: [] }, updated_ms: 1000 },
  };
  const r = applyPull(fresh, EMPTY_SNAPSHOT, remote, '');
  assert.ok(r.changed);
  assert.equal(r.state.log.length, 2);
  assert.deepEqual(r.state.weights, [{ date: '2026-10-01', kg: 90.5 }]);
  assert.deepEqual(r.state.profile, profile);
  assert.equal(r.name, 'Joshua');
  assert.deepEqual(r.state.favorites, [kwark.id]);
  // Wat van de server kwam, hoeft niet terug (behalve de samengevoegde bibliotheek bij de eerste keer).
  const p = planPush(r.state, r.snap, r.name, 2000);
  assert.equal(p.upsertEntries.length, 0);
  assert.equal(p.upsertWeights.length, 0);
  assert.equal(p.meta, null);
});

test('jsonb met andere sleutelvolgorde geeft geen valse wijziging', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const shuffled = { ...phone.log[0], food: { source: kwark.source, per: { v: 0.2, k: 4, e: 9, kcal: 52 }, name: kwark.name, id: kwark.id } as Food };
  assert.equal(entryHash(shuffled), snap.entries.a);
  const r = applyPull(phone, snap, { ...none, entries: [{ ...shuffled, deleted: false, updated_ms: 1500 }] }, '');
  assert.equal(r.changed, false);
});

test('lokale wijziging wint van de server; zonder lokale wijziging volgt de app de server', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const remote: Remote = {
    ...none,
    entries: [
      { ...phone.log[0], grams: 999, deleted: false, updated_ms: 2000 },
      { id: 'b', date: '2026-10-02', meal: 'lunch', food: null, grams: null, deleted: true, updated_ms: 2000 },
      { id: 'c', date: '2026-10-03', meal: 'diner', food: brood, grams: 120, deleted: false, updated_ms: 2000 },
    ],
  };
  // a is lokaal aangepast → blijft 200
  const local = { ...phone, log: [{ ...phone.log[0], grams: 200 }, phone.log[1]] };
  const r = applyPull(local, snap, remote, '');
  assert.deepEqual(
    r.state.log.map((e) => [e.id, e.grams]),
    [
      ['a', 200],
      ['c', 120],
    ],
  );
  assert.equal(r.snap.entries.b, undefined);
  // a staat nog als gewijzigd, c niet
  const p = planPush(r.state, r.snap, '', 3000);
  assert.deepEqual(p.upsertEntries.map((e) => e.id), ['a']);
  assert.deepEqual(p.deleteEntries, []);
});

test('een lokaal verwijderde regel komt niet terug van de server', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const local = { ...phone, log: [phone.log[1]] }; // a verwijderd, nog niet verstuurd
  const r = applyPull(local, snap, { ...none, entries: [{ ...phone.log[0], deleted: false, updated_ms: 1000 }] }, '');
  assert.equal(r.state.log.length, 1);
  assert.deepEqual(planPush(r.state, r.snap, '', 2000).deleteEntries, ['a']);
});

test('eerste sync op een telefoon met eigen gegevens: bibliotheek samengevoegd, profiel van de server', () => {
  const remote: Remote = {
    ...none,
    meta: { profile: { ...profile, age: 31 }, goals, prefs: null, name: 'Joshua', updated_ms: 500 },
    library: { data: { foods: { [brood.id]: brood }, favorites: [brood.id], favMeals: [{ id: 'm1', name: 'Lunch', items: [] }], imports: ['x'] }, updated_ms: 500 },
  };
  const local = st({ foods: { [kwark.id]: kwark }, favorites: [kwark.id] });
  const r = applyPull(local, EMPTY_SNAPSHOT, remote, '');
  assert.equal((r.state.profile as any).age, 31);
  assert.deepEqual(Object.keys(r.state.foods).sort(), [brood.id, kwark.id].sort());
  assert.deepEqual(r.state.favorites, [kwark.id, brood.id]);
  assert.equal(r.state.favMeals.length, 1);
  const p = planPush(r.state, r.snap, r.name, 1000);
  assert.ok(p.library, 'samengevoegde bibliotheek gaat omhoog');
  assert.equal(p.meta, null);
});

test('later: nieuwere bibliotheek van de server vervangt de lokale (verwijderingen komen door)', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const remote: Remote = { ...none, library: { data: { foods: phone.foods, favorites: [], favMeals: [], imports: [] }, updated_ms: 2000 } };
  const r = applyPull(phone, snap, remote, '');
  assert.deepEqual(r.state.favorites, []);
  assert.equal(planPush(r.state, r.snap, '', 3000).library, null);
  // een oudere of eigen rij (zelfde ms) doet niets
  assert.equal(applyPull(phone, snap, { ...none, library: { ...remote.library!, updated_ms: 1000 } }, '').changed, false);
});

test('gewichten: server-wijziging komt door, lokale wijziging wint', () => {
  const snap = afterPush(EMPTY_SNAPSHOT, planPush(phone, EMPTY_SNAPSHOT, '', 1000));
  const remote: Remote = {
    ...none,
    weights: [
      { date: '2026-10-01', kg: 90.1, deleted: false, updated_ms: 2000 },
      { date: '2026-10-03', kg: 89.8, deleted: false, updated_ms: 2000 },
    ],
  };
  const r = applyPull(phone, snap, remote, '');
  assert.deepEqual(r.state.weights, [
    { date: '2026-10-01', kg: 90.1 },
    { date: '2026-10-03', kg: 89.8 },
  ]);
  const local = { ...phone, weights: [{ date: '2026-10-01', kg: 91 }] };
  assert.deepEqual(applyPull(local, snap, remote, '').state.weights[0], { date: '2026-10-01', kg: 91 });
});
