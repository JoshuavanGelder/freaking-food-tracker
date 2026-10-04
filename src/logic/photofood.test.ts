import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiFood, matchItem, parsePhotoResult, photoError, photoTotals, queriesFor, roundGrams } from './photofood.ts';
import type { PhotoItem } from './photofood.ts';
import { nevoToFood, searchIn } from './nevo.ts';
import type { NevoData } from './nevo.ts';
import type { Food } from './off.ts';

const NEVO = JSON.parse(readFileSync(new URL('../data/nevo.json', import.meta.url), 'utf8')) as NevoData;
const find = (mine: Food[] = []) => ({
  nevo: (q: string) => searchIn(NEVO.items, q, 10).map(nevoToFood),
  mine: (q: string) => mine.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
});

const item = (name: string, query: string, grams = 150, unit: 'g' | 'ml' = 'g'): PhotoItem => ({
  name,
  query,
  grams,
  unit,
  confidence: 'midden',
  portion: '',
  per: { kcal: 120, e: 5, k: 15, v: 4 },
});

test('parsePhotoResult controleert en rondt af', () => {
  const r = parsePhotoResult({
    titel: 'Rijst met kip',
    onderdelen: [
      { naam: 'witte rijst', zoekterm: 'rijst witte gekookt', gram: 183, portie: '1 bord', eenheid: 'g', zekerheid: 'hoog', kcal: 130, eiwit: 2.7, koolhydraten: 28, vet: 0.3 },
      { naam: 'Kipfilet', zoekterm: '', gram: '120,4', eenheid: 'x', zekerheid: 'zeker', kcal: 'veel' },
      { naam: '', gram: 50 },
      { naam: 'Ijsklontje', gram: -5 },
      { naam: 'Soep', gram: 99999, eenheid: 'ml' },
      'onzin',
    ],
    verborgen_vet: true,
    opmerking: '  Kijk de saus na.  ',
  });
  assert.equal(r.title, 'Rijst met kip');
  assert.equal(r.items.length, 4);
  assert.deepEqual(
    r.items.map((i) => [i.name, i.query, i.grams, i.unit, i.confidence]),
    [
      ['Witte rijst', 'rijst witte gekookt', 180, 'g', 'hoog'],
      ['Kipfilet', 'Kipfilet', 120, 'g', 'midden'],
      ['Ijsklontje', 'Ijsklontje', 1, 'g', 'midden'],
      ['Soep', 'Soep', 2000, 'ml', 'midden'],
    ],
  );
  assert.equal(r.items[1].per.kcal, 0);
  assert.equal(r.items[0].portion, '1 bord');
  assert.equal(r.items[1].portion, '');
  assert.equal(r.hiddenFat, true);
  assert.equal(r.note, 'Kijk de saus na.');
});

test('parsePhotoResult met rommel geeft een lege lijst', () => {
  for (const raw of [null, 'tekst', 42, {}, { onderdelen: 'nee' }]) {
    const r = parsePhotoResult(raw);
    assert.equal(r.items.length, 0);
    assert.equal(r.hiddenFat, false);
    assert.ok(r.title);
  }
});

test('roundGrams', () => {
  assert.deepEqual([3.4, 17.6, 42, 97, 104, 1234, 0, NaN].map(roundGrams), [3, 18, 40, 95, 100, 1230, 1, 1]);
});

test('queriesFor gaat van specifiek naar algemeen en slaat vage woorden over', () => {
  assert.deepEqual(queriesFor(item('Witte rijst', 'rijst witte gekookt')), ['rijst witte gekookt', 'rijst witte', 'rijst', 'Witte rijst']);
  assert.deepEqual(queriesFor(item('Kip', 'kip bereid')), ['kip bereid', 'Kip']);
});

test('koppelt gewone maaltijdonderdelen aan het juiste NEVO-product', () => {
  const cases: [string, string, string][] = [
    ['Witte rijst', 'rijst witte gekookt', 'Rijst witte gekookt'],
    ['Kipfilet', 'kipfilet bereid', 'Kipfilet bereid'],
    ['Broccoli', 'broccoli gekookt', 'Broccoli gekookt'],
    ['Pindasaus', 'saus sate kant-en-klaar', 'Saus sate- kant-en-klaar bereid'],
    ['Pindasaus', 'pindasaus', 'Saus sate- kant-en-klaar bereid'],
    ['Spaghetti', 'pasta witte gekookt', 'Pasta witte gem gekookt'],
    ['Koffie', 'koffie bereid', 'Koffie bereid'],
    ['Friet', 'frites bereid', 'Frites bereid gem'],
    ['Halfvolle melk', 'melk halfvolle', 'Melk halfvolle'],
    ['Sla', 'sla', 'Sla gem rauw'],
  ];
  for (const [name, q, want] of cases) {
    const m = matchItem(item(name, q), find());
    assert.equal(m.source, 'nevo', name);
    assert.equal(m.food.name, want, `${name} (${q})`);
    assert.ok(!m.alternatives.some((f) => f.id === m.food.id), 'gekozen product niet ook als alternatief');
    assert.ok(m.alternatives.some((f) => f.id.startsWith('ai:')), 'AI-schatting blijft kiesbaar');
  }
});

test('geen poeder of light als je dat niet ziet', () => {
  assert.doesNotMatch(matchItem(item('Koffie', 'koffie'), find()).food.name, /poeder/);
  assert.doesNotMatch(matchItem(item('Cola', 'frisdrank cola'), find()).food.name, /light/);
});

test('eigen product met dezelfde naam gaat voor', () => {
  const own: Food = { id: 'eigen:kip', name: 'Kipfilet', per: { kcal: 110, e: 24, k: 0, v: 1.5 }, source: 'eigen' };
  const m = matchItem(item('Kipfilet', 'kipfilet bereid'), find([own]));
  assert.equal(m.source, 'mine');
  assert.equal(m.food.id, 'eigen:kip');
  assert.equal(m.alternatives[0].name, 'Kipfilet bereid');
});

test('niets gevonden: AI-schatting', () => {
  const m = matchItem(item('Zwrbl taart', 'zwrbl'), find());
  assert.equal(m.source, 'ai');
  assert.equal(m.food.id, 'ai:zwrbl-taart');
  assert.equal(m.food.per.kcal, 120);
  assert.equal(m.grams, 150);
  assert.ok(aiFood(item('Crème brûlée', 'x')).id === 'ai:creme-brulee');
});

test('photoTotals en foutmeldingen', () => {
  const f: Food = { id: 'x', name: 'x', per: { kcal: 200, e: 10, k: 20, v: 5 }, source: 'eigen' };
  assert.deepEqual(photoTotals([{ food: f, grams: 50 }, { food: f, grams: 150 }]), { kcal: 400, e: 20, k: 40, v: 10 });
  assert.equal(photoError(429, { message: 'Limiet' }), 'Limiet');
  assert.match(photoError(401, null), /uitgelogd/);
  assert.match(photoError(500, 'x'), /500/);
});

test('beschrijving: kiwi, banaan en andere stuks koppelen aan NEVO', () => {
  const cases: [string, string, string][] = [
    ['Kiwi', 'kiwi', 'Kiwi gem'],
    ['Banaan', 'banaan', 'Banaan'],
    ['Appel', 'appel', 'Appel m schil gem'],
    ['Gekookt ei', 'ei gekookt', 'Ei kippen- gekookt gem'],
    ['Beschuit', 'beschuit', 'Beschuit naturel'],
    ['Cola', 'frisdrank cola', ''],
  ];
  for (const [name, q, want] of cases) {
    const m = matchItem(item(name, q, 150), find());
    assert.equal(m.source, 'nevo', name);
    if (want) assert.equal(m.food.name, want, name);
    assert.equal(m.grams, 150);
  }
});
