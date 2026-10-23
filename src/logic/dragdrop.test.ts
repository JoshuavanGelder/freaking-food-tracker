import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneAt } from './dragdrop.ts';

const zones = [
  { id: 'ontbijt', top: 100, bottom: 160 },
  { id: 'lunch', top: 168, bottom: 228 },
  { id: 'diner', top: 236, bottom: 296 },
];

test('punt in een zone', () => {
  assert.equal(zoneAt(zones, 130), 'ontbijt');
  assert.equal(zoneAt(zones, 200), 'lunch');
  assert.equal(zoneAt(zones, 296), 'diner');
});

test('tussen twee zones: dichtstbijzijnde', () => {
  assert.equal(zoneAt(zones, 162), 'ontbijt');
  assert.equal(zoneAt(zones, 166), 'lunch');
});

test('ver buiten alle zones: niets', () => {
  assert.equal(zoneAt(zones, 20), null);
  assert.equal(zoneAt(zones, 400), null);
  assert.equal(zoneAt([], 100), null);
});

test('net boven of onder binnen de marge telt nog mee', () => {
  assert.equal(zoneAt(zones, 90), 'ontbijt');
  assert.equal(zoneAt(zones, 310), 'diner');
});
