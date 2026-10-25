import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentForMeal, searchMine } from './mine.ts';
import type { Food } from './off.ts';

const f = (id: string, name: string, source: Food['source'] = 'off', brand?: string): Food => ({
  id,
  name,
  brand,
  per: { kcal: 100, e: 1, k: 1, v: 1 },
  source,
});

const foods: Record<string, Food> = {};
for (const x of [
  f('off:1', 'Magere kwark', 'off', 'AH'),
  f('nevo:2', 'Kwark mager', 'nevo'),
  f('eigen:3', 'Kwark van de markt', 'eigen'),
  f('off:4', 'Crème fraîche', 'off', 'Campina'),
  f('eigen:5', 'Soep', 'eigen'),
  f('summary:2026-09-22', 'Kwark dagtotaal', 'eigen'),
]) foods[x.id] = x;

const src = { foods, recent: ['off:1', 'nevo:2', 'off:4', 'summary:2026-09-22'], favorites: ['off:1', 'eigen:3'] };

test('volgorde: recent, dan favorieten, dan eigen; elk product één keer', () => {
  assert.deepEqual(searchMine(src, 'kwark').map((x) => x.id), ['off:1', 'nevo:2', 'eigen:3']);
});

test('dagtotalen van een import komen nooit mee', () => {
  assert.equal(searchMine(src, 'dagtotaal').length, 0);
});

test('zoekt op naam én merk, zonder letterhoofdletters of accenten', () => {
  assert.deepEqual(searchMine(src, 'CREME').map((x) => x.id), ['off:4']);
  assert.deepEqual(searchMine(src, 'campina fraiche').map((x) => x.id), ['off:4']);
  assert.deepEqual(searchMine(src, 'ah kwark').map((x) => x.id), ['off:1']);
});

test('eigen producten die nooit gelogd zijn worden ook gevonden', () => {
  assert.deepEqual(searchMine(src, 'soep').map((x) => x.id), ['eigen:5']);
});

test('uitsluiten wat al bij de basisproducten staat', () => {
  assert.deepEqual(searchMine(src, 'kwark', new Set(['nevo:2'])).map((x) => x.id), ['off:1', 'eigen:3']);
});

test('te korte zoekopdracht en limiet', () => {
  assert.deepEqual(searchMine(src, 'k'), []);
  assert.equal(searchMine(src, 'kwark', new Set(), 2).length, 2);
});

test('recent per maaltijd: alleen die maaltijd, nieuwste eerst, geen dubbelen, geen dagtotalen', () => {
  const log = [
    { date: '2026-10-20', meal: 'ontbijt', food: foods['off:1'] },
    { date: '2026-10-22', meal: 'ontbijt', food: foods['off:4'] },
    { date: '2026-10-22', meal: 'lunch', food: foods['eigen:5'] },
    { date: '2026-10-23', meal: 'ontbijt', food: foods['off:1'] },
    { date: '2026-10-23', meal: 'ontbijt', food: foods['summary:2026-09-22'] },
    { date: '2026-10-21', meal: 'ontbijt', food: foods['nevo:2'] },
  ];
  assert.deepEqual(recentForMeal(log, foods, 'ontbijt').map((x) => x.id), ['off:1', 'off:4', 'nevo:2']);
  assert.deepEqual(recentForMeal(log, foods, 'lunch').map((x) => x.id), ['eigen:5']);
  assert.deepEqual(recentForMeal(log, foods, 'diner'), []);
});

test('recent per maaltijd: maximaal het opgegeven aantal', () => {
  const log = ['off:1', 'nevo:2', 'off:4'].map((id, i) => ({ date: `2026-10-0${i + 1}`, meal: 'snacks', food: foods[id] }));
  assert.deepEqual(recentForMeal(log, foods, 'snacks', 2).map((x) => x.id), ['off:4', 'nevo:2']);
});
