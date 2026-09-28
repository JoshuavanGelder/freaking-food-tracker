import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFood } from './off.ts';

test('Open Food Facts product omzetten', () => {
  const f = toFood({
    code: '8718452000000',
    product_name: 'Magere kwark',
    brands: 'Merk A, Merk B',
    serving_quantity: '250',
    nutriments: { 'energy-kcal_100g': 59, proteins_100g: 9.8, carbohydrates_100g: 3.5, fat_100g: 0.2, salt_100g: '0.1' },
  })!;
  assert.equal(f.id, 'off:8718452000000');
  assert.equal(f.brand, 'Merk A');
  assert.equal(f.per.kcal, 59);
  assert.equal(f.per.salt, 0.1);
  assert.equal(f.servingG, 250);
});

test('kJ wordt kcal als kcal ontbreekt', () => {
  const f = toFood({ code: '1', product_name: 'X', nutriments: { 'energy-kj_100g': 418.4 } })!;
  assert.ok(Math.abs(f.per.kcal - 100) < 1e-9);
});

test('product zonder naam of energie telt niet mee', () => {
  assert.equal(toFood({ code: '1', product_name: '', nutriments: { 'energy-kcal_100g': 1 } }), null);
  assert.equal(toFood({ code: '1', product_name: 'X', nutriments: {} }), null);
});
