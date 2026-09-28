import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nevoToFood, norm, searchIn } from './nevo.ts';
import type { NevoItem } from './nevo.ts';

const items: NevoItem[] = [
  [1, 'Appel m schil gemiddeld', 'Appel', 'g', 54, 0.4, 12.1, 0.1, 2.0, 11.0, 0],
  [2, 'Appelmoes', '', 'g', 76, 0.2, 17.6, 0.1, 1.2, 15.5, 0],
  [3, 'Brood volkoren', 'Volkorenbrood', 'g', 223, 9.7, 37.3, 2.5, 7.4, 2.1, 0.5],
  [4, 'Kwark mager naturel', '', 'g', 57, 8.9, 4.0, 0.2, null, 4.0, 0.1],
  [5, 'Crème fraîche', '', 'g', 297, 2.4, 3.1, 30.5, 0, 3.1, 20.1],
  [6, 'Aardappelen gekookt', '', 'g', 83, 1.8, 17.2, 0.1, 1.9, 0.6, 0],
  [7, 'Aardappelen rauw', '', 'g', 83, 2.0, 17.0, 0.1, 1.6, 0.7, 0],
  [8, 'Melk halfvol', 'Halfvolle melk', 'ml', 46, 3.5, 4.7, 1.5, 0, 4.7, 1.0],
  [9, 'Pindakaas', '', 'g', 634, 24.4, 11.2, 51.9, 7.0, 6.4, 9.7],
  [10, 'Saus pinda bereid', '', 'g', 140, 4.0, 10.0, 9.0, 1.0, 5.0, 2.0],
];

const names = (q: string) => searchIn(items, q).map((i) => i[1]);

test('norm haalt accenten en leestekens weg', () => {
  assert.equal(norm('Crème fraîche, 30%'), 'creme fraiche 30%');
});

test('los woord eerst, dan namen die ermee beginnen, dan de rest', () => {
  assert.deepEqual(names('appel'), ['Appel m schil gemiddeld', 'Appelmoes', 'Aardappelen rauw', 'Aardappelen gekookt']);
});

test('alle woorden moeten voorkomen, in elke volgorde', () => {
  assert.deepEqual(names('mager kwark'), ['Kwark mager naturel']);
  assert.deepEqual(names('kwark vol'), []);
});

test('ook in samenstellingen en synoniemen', () => {
  assert.deepEqual(names('volkorenbrood'), ['Brood volkoren']);
  assert.deepEqual(names('halfvolle'), ['Melk halfvol']);
});

test('accenten maken niet uit', () => {
  assert.deepEqual(names('creme'), ['Crème fraîche']);
});

test('rauw staat boven bereid, tenzij je bereid zoekt', () => {
  assert.deepEqual(names('aardappelen'), ['Aardappelen rauw', 'Aardappelen gekookt']);
  assert.deepEqual(names('aardappelen gekookt'), ['Aardappelen gekookt']);
  assert.deepEqual(names('pinda'), ['Pindakaas', 'Saus pinda bereid']);
});

test('te korte zoekopdracht geeft niets', () => {
  assert.deepEqual(names('a'), []);
  assert.deepEqual(names('  '), []);
});

test('omzetten naar een product', () => {
  const f = nevoToFood(items[3]);
  assert.equal(f.id, 'nevo:4');
  assert.equal(f.source, 'nevo');
  assert.equal(f.unit, 'g');
  assert.deepEqual(f.per, { kcal: 57, e: 8.9, k: 4.0, v: 0.2, sugar: 4.0, satFat: 0.1 });
  assert.equal(nevoToFood(items[7]).unit, 'ml');
});
