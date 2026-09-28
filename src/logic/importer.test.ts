import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, toEntries } from './importer.ts';

const sample = {
  type: 'fft-import',
  v: 1,
  id: 'test-1',
  date: '2026-09-28',
  items: [
    { meal: 'ontbijt', name: 'Magere kwark', brand: 'AH', amount: 250, kcal: 130, e: 22.5, k: 9.5, v: 0.3 },
    { meal: 'lunch', name: 'Bollen wit', brand: 'AH', amount: 50, kcal: 124, portions: 1, portionLabel: '1 bol' },
  ],
};

test('import lezen en omrekenen naar per 100', () => {
  const r = parseImport('Hier is je tekst: ' + JSON.stringify(sample) + ' klaar');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const entries = toEntries(r.file);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].food.per.kcal, 52);
  assert.equal(entries[0].food.per.e, 9);
  assert.equal(entries[0].grams, 250);
  assert.equal(entries[0].food.id, 'import:magere-kwark-ah');
  assert.equal(entries[1].food.servingG, 50);
  assert.equal(entries[1].food.servingLabel, '1 bol');
});

test('foute import geeft een duidelijke melding', () => {
  assert.equal(parseImport('').ok, false);
  assert.equal(parseImport('{kapot').ok, false);
  const bad = parseImport(JSON.stringify({ ...sample, items: [{ meal: 'brunch', name: 'x', amount: 1, kcal: 1 }] }));
  assert.equal(bad.ok, false);
});
