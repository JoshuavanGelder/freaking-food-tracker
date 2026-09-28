import { test } from 'node:test';
import assert from 'node:assert/strict';
import { microTarget, saltOf, satFatMax, summarizeMicros } from './micros.ts';
import { forGrams } from './calc.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('normen verschillen per geslacht en leeftijd', () => {
  assert.equal(microTarget('fe', { sex: 'man', age: 30 }), 11);
  assert.equal(microTarget('fe', { sex: 'vrouw', age: 30 }), 16);
  assert.equal(microTarget('fe', { sex: 'vrouw', age: 55 }), 11);
  assert.equal(microTarget('ca', { sex: 'man', age: 20 }), 1000);
  assert.equal(microTarget('ca', { sex: 'man', age: 30 }), 950);
  assert.equal(microTarget('vitD', { sex: 'man', age: 72 }), 20);
  assert.equal(microTarget('na', { sex: 'man', age: 30 }), null);
});

test('zout van het etiket, anders uit natrium', () => {
  assert.equal(saltOf({ kcal: 1, e: 0, k: 0, v: 0, salt: 1.2 }), 1.2);
  near(saltOf({ kcal: 1, e: 0, k: 0, v: 0, micro: { na: 400 } })!, 1);
  assert.equal(saltOf({ kcal: 1, e: 0, k: 0, v: 0 }), undefined);
});

test('verzadigd vet max. 10% van de energie', () => {
  near(satFatMax(1800), 20);
});

test('forGrams rekent micro\'s mee', () => {
  const p = forGrams({ kcal: 100, e: 0, k: 0, v: 0, micro: { vitC: 10, ca: 50 } }, 250);
  assert.deepEqual(p.micro, { vitC: 25, ca: 125 });
});

test('dagtotaal met dekking en grootste bronnen', () => {
  const s = summarizeMicros([
    { name: 'Kwark', grams: 200, per: { kcal: 50, e: 8, k: 4, v: 0, satFat: 0, micro: { ca: 140, na: 40 } } },
    { name: 'Banaan', grams: 100, per: { kcal: 100, e: 1, k: 20, v: 0, micro: { ca: 6, kal: 374 } } },
    { name: 'Koek', grams: 100, per: { kcal: 200, e: 5, k: 60, v: 20, salt: 0.5, satFat: 10 } },
  ]);
  near(s.kcal, 400);
  near(s.micro.ca.amount, 280 + 6);
  near(s.micro.ca.known, 200 / 400);
  assert.deepEqual(s.micro.ca.top.map((t) => t.name), ['Kwark', 'Banaan']);
  near(s.micro.kal.known, 100 / 400);
  near(s.salt.amount, 0.2 + 0.5); // kwark: 80 mg natrium = 0,2 g zout
  near(s.salt.known, 300 / 400);
  near(s.satFat.amount, 10);
  near(s.anyKnown, 200 / 400);
});

test('gemiddelde over meerdere dagen', () => {
  const s = summarizeMicros([{ name: 'Sinaasappel', grams: 200, per: { kcal: 40, e: 1, k: 9, v: 0, micro: { vitC: 50 } } }], 2);
  near(s.micro.vitC.amount, 50);
  near(s.micro.vitC.top[0].amount, 50);
  near(s.kcal, 40);
});

test('lege dag', () => {
  const s = summarizeMicros([]);
  assert.equal(s.kcal, 0);
  assert.equal(s.micro.vitC.known, 0);
  assert.equal(s.anyKnown, 0);
});
