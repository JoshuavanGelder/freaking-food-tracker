import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFood, parseAmount, portionCount, amountText, normalizeBarcode, isStoreLabel } from './off.ts';

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

test('blikje frisdrank: eenheid ml en hele blikje als portie', () => {
  const f = toFood({
    code: '5',
    product_name: 'Cola zero',
    quantity: '33 cl',
    product_quantity: '330',
    product_quantity_unit: 'ml',
    nutriments: { 'energy-kcal_100g': 0.3 },
  })!;
  assert.equal(f.unit, 'ml');
  assert.equal(f.servingG, 330);
  assert.equal(f.servingLabel, 'hele verpakking');
});

test('portie uit serving_size als serving_quantity ontbreekt', () => {
  const f = toFood({
    code: '6',
    product_name: 'Witte bolletjes',
    serving_size: '1 bolletje (50 g)',
    quantity: '300 g',
    nutriments: { 'energy-kcal_100g': 260 },
  })!;
  assert.equal(f.unit, 'g');
  assert.equal(f.servingG, 50);
  assert.equal(f.servingLabel, '1 bolletje');
});

test('portie per stuk uit "6 x 50 g"', () => {
  const f = toFood({ code: '7', product_name: 'Bolletjes', quantity: '6 x 50 g', product_quantity: 300, nutriments: { 'energy-kcal_100g': 260 } })!;
  assert.equal(f.servingG, 50);
  assert.equal(f.servingLabel, '1 stuk');
});

test('grote verpakking zonder portie: geen standaardportie', () => {
  const f = toFood({ code: '8', product_name: 'Rijst', quantity: '1 kg', nutriments: { 'energy-kcal_100g': 350 } })!;
  assert.equal(f.servingG, undefined);
  assert.equal(f.unit, 'g');
});

test('waarden alleen per portie worden omgerekend naar per 100', () => {
  const f = toFood({
    code: '9',
    product_name: 'Reep',
    serving_quantity: 50,
    nutriments: { 'energy-kcal_serving': 250, proteins_serving: 5 },
  })!;
  assert.equal(f.per.kcal, 500);
  assert.equal(f.per.e, 10);
});

test('hoeveelheden uit tekst', () => {
  assert.deepEqual(parseAmount('1,5 l'), { n: 1500, unit: 'ml' });
  assert.deepEqual(parseAmount('250ml'), { n: 250, unit: 'ml' });
  assert.equal(parseAmount('1 stuk'), null);
});

test('porties tellen en tonen', () => {
  const bol = { id: 'x', name: 'Bolletje', per: { kcal: 260, e: 8, k: 50, v: 2 }, servingG: 50, servingLabel: '1 bolletje', unit: 'g' as const, source: 'off' as const };
  assert.equal(portionCount(bol, 100), 2);
  assert.equal(portionCount(bol, 75), 1.5);
  assert.equal(portionCount(bol, 60), null);
  assert.equal(amountText(bol, 100), '2× bolletje · 100 g');
  assert.equal(amountText({ ...bol, servingLabel: undefined }, 25), '0,5× portie · 25 g');
  assert.equal(amountText({ ...bol, servingG: undefined }, 80), '80 g');
});

test('barcodes normaliseren, ook GS1-128 van de versafdeling', () => {
  assert.equal(normalizeBarcode('8710522979495'), '8710522979495');
  assert.equal(normalizeBarcode('0108719587122211172609303103000300'), '8719587122211');
  assert.equal(normalizeBarcode('\u001d0108719587122211172609303103000300'), '8719587122211');
  assert.equal(normalizeBarcode('(01)08719587122211(17)260930'), '8719587122211');
  assert.equal(normalizeBarcode('https://id.example.com/01/08719587122211/10/ABC'), '8719587122211');
  assert.equal(normalizeBarcode('hallo'), null);
  assert.equal(isStoreLabel('2123456789012'), true);
});

test('bereide portie groter dan de verpakking wordt genegeerd', () => {
  const f = toFood({
    code: '8710522979495',
    product_name: 'Mix voor macaroni',
    quantity: '61 g',
    product_quantity: 61,
    serving_size: '462 g',
    serving_quantity: 462,
    nutriments: { 'energy-kcal_100g': 278, proteins_100g: 9.9, carbohydrates_100g: 50, fat_100g: 3, fiber_100g: 8.9 },
  })!;
  assert.equal(f.servingG, undefined);
  assert.equal(f.packageG, 61);
  assert.equal(f.per.kcal, 278);
});

test('te lage kcal wordt gecorrigeerd met de macro\'s', () => {
  const f = toFood({
    code: '1',
    product_name: 'Mix',
    nutriments: { 'energy-kcal_100g': 11, proteins_100g: 9.9, carbohydrates_100g: 50, fat_100g: 3, fiber_100g: 8.9 },
  })!;
  assert.ok(Math.abs(f.per.kcal - (39.6 + 200 + 27 + 17.8)) < 1e-9);
  assert.ok(f.note);
  // drankje met alcohol: hoger dan de macro's is prima
  const bier = toFood({ code: '2', product_name: 'Bier', nutriments: { 'energy-kcal_100g': 43, carbohydrates_100g: 3.6, proteins_100g: 0.5 } })!;
  assert.equal(bier.per.kcal, 43);
});

test('ingetypte codes', () => {
  assert.equal(normalizeBarcode('08719587122211'), '8719587122211');
  assert.equal(normalizeBarcode('(01)08719587122211'), '8719587122211');
  assert.equal(normalizeBarcode('0108719587122211'), '8719587122211');
});
