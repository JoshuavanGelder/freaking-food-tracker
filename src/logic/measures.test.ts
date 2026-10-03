import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMeasures, measureById, measureCount, measureSize, measuresFor, withMeasure } from './measures.ts';

test('lepels voor alles, kopje/glas/mok alleen voor ml', () => {
  assert.deepEqual(measuresFor('g').map((m) => m.id), ['tl', 'dl', 'el']);
  assert.deepEqual(measuresFor('ml').map((m) => m.id), ['tl', 'dl', 'el', 'kopje', 'glas', 'mok']);
});

test('eigen grootte wint, rommel valt terug op de standaard', () => {
  const el = measureById('el')!;
  assert.equal(measureSize(el), 15);
  assert.equal(measureSize(el, { el: 21 }), 21);
  assert.equal(measureSize(el, { el: -3 }), 15);
  assert.equal(measureSize(el, { el: 99999 }), 15);
  assert.equal(measureSize(el, null), 15);
});

test('eigen maten opschonen', () => {
  assert.deepEqual(cleanMeasures({ el: 12, tl: 'veel', raar: 5, glas: 0 }), { el: 12 });
  assert.equal(cleanMeasures({ raar: 1 }), undefined);
  assert.equal(cleanMeasures(null), undefined);
  assert.equal(cleanMeasures([1, 2]), undefined);
});

test('aantal maten in halven', () => {
  assert.equal(measureCount(30, 15), 2);
  assert.equal(measureCount(22.5, 15), 1.5);
  assert.equal(measureCount(20, 15), null);
  assert.equal(measureCount(0, 15), null);
  assert.equal(measureCount(15, 0), null);
});

test('maat onthouden alleen als hij afwijkt', () => {
  const el = measureById('el')!;
  assert.equal(withMeasure(undefined, el, 15), undefined); // standaard: niets opslaan
  assert.deepEqual(withMeasure(undefined, el, 21), { el: 21 });
  assert.deepEqual(withMeasure({ el: 21, tl: 4 }, el, 21), { el: 21, tl: 4 }); // ongewijzigd
  assert.deepEqual(withMeasure({ el: 21, tl: 4 }, el, 15), { tl: 4 }); // terug naar standaard
  assert.equal(withMeasure({ el: 21 }, el, 15), undefined);
});
