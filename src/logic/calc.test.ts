import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmr,
  computeGoal,
  macroGrams,
  MACRO_PLANS,
  forGrams,
  trendLine,
  trendSlope,
  daysToTarget,
  streak,
  addDays,
  parseNumber,
  splitTotal,
  DEFAULT_GOALS,
  type Profile,
  type WeightEntry,
} from './calc.ts';

const man: Profile = { sex: 'man', age: 30, heightCm: 183, activity: 1.375 };

test('Mifflin-St Jeor voor man en vrouw', () => {
  assert.equal(bmr(man, 84.7), 1845.75);
  assert.equal(bmr({ ...man, sex: 'vrouw' }, 84.7), 1845.75 - 166);
});

test('kcal-doel via tempo: 0,5 kg per week = 550 kcal tekort', () => {
  const r = computeGoal(man, 84.7, { ...DEFAULT_GOALS, mode: 'tempo', paceKgPerWeek: 0.5 });
  assert.equal(Math.round(r.tdee), 2538);
  assert.equal(r.deficit, 550);
  assert.equal(r.goal, 1990);
  assert.deepEqual(r.warnings, []);
});

test('kcal-doel via kcal per dag rekent tempo terug', () => {
  const r = computeGoal(man, 84.7, { ...DEFAULT_GOALS, mode: 'kcal', kcalPerDay: 1990 });
  assert.equal(r.goal, 1990);
  assert.ok(Math.abs(r.pace - 0.498) < 0.001);
});

test('waarschuwingen bij te snel tempo en te weinig kcal', () => {
  const fast = computeGoal(man, 84.7, { ...DEFAULT_GOALS, paceKgPerWeek: 1 });
  assert.ok(fast.warnings.some((w) => w.includes('1%')));
  const low = computeGoal(man, 84.7, { ...DEFAULT_GOALS, mode: 'kcal', kcalPerDay: 1200 });
  assert.ok(low.warnings.some((w) => w.includes('1.500')));
});

test('macroplan eiwitrijk bij 1990 kcal', () => {
  const plan = MACRO_PLANS.find((p) => p.id === 'eiwit')!;
  assert.deepEqual(macroGrams(1990, plan.split), { e: 174, k: 199, v: 55 });
  assert.equal(splitTotal(plan.split), 100);
});

test('portie omrekenen', () => {
  const p = forGrams({ kcal: 59, e: 9.8, k: 3.5, v: 0.2 }, 250);
  assert.equal(Math.round(p.kcal), 148);
  assert.ok(Math.abs(p.e - 24.5) < 1e-9);
});

test('trendlijn en helling', () => {
  const start = '2026-08-25';
  const entries: WeightEntry[] = [];
  for (let i = 0; i < 35; i++) entries.push({ date: addDays(start, i), kg: 87 - 0.065 * i });
  const t = trendLine(entries);
  assert.equal(t.length, 35);
  const slope = trendSlope(entries)!;
  assert.ok(Math.abs(slope + 0.065) < 1e-9);
  // dubbele meting op één dag: de laatste telt
  const dup = trendLine([{ date: start, kg: 90 }, { date: start, kg: 80 }]);
  assert.equal(dup[0].kg, 80);
});

test('dagen tot doel', () => {
  assert.equal(daysToTarget(85, 78, -0.07), 100);
  assert.equal(daysToTarget(85, 78, 0.05), null);
  assert.equal(daysToTarget(78.02, 78, -0.05), 0);
  assert.equal(daysToTarget(70, 75, 0.05), 100);
});

test('streak telt aaneengesloten dagen', () => {
  const today = '2026-09-28';
  const days = new Set([today, '2026-09-27', '2026-09-26', '2026-09-24']);
  assert.equal(streak(days, today), 3);
  days.delete(today);
  assert.equal(streak(days, today), 2);
});

test('getallen invoeren zoals mensen typen', () => {
  assert.equal(parseNumber('0,5'), 0.5);
  assert.equal(parseNumber('0.5'), 0.5);
  assert.equal(parseNumber('1.990'), 1990);
  assert.equal(parseNumber('84.7'), 84.7);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});
