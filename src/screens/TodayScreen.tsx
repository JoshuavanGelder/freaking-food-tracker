import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, dateKey, forGrams, formatLong, formatShort, nl, streak, sumNutrition } from '../logic/calc';
import { MEALS, MealId, itemsKey, useApp } from '../store';
import { amountText } from '../logic/off';
import { useNav } from '../nav';
import { useGoal } from '../useGoal';
import { C, F, shadow } from '../theme';
import { Icon } from '../icons';
import { Bar, Card, H1, H2, HeartButton, IconButton, Ring, Row, Screen, T } from '../ui';
import { MICROS, SALT_MAX, microTarget } from '../logic/micros';
import { summarizeLog } from './MicrosScreen';

export function TodayScreen() {
  const { state, actions } = useApp();
  const nav = useNav();
  const goal = useGoal();
  const [open, setOpen] = useState<MealId | null>(null);

  const today = dateKey(new Date());
  const day = nav.day;
  const entries = useMemo(() => state.log.filter((e) => e.date === day), [state.log, day]);
  const totals = sumNutrition(entries.map((e) => forGrams(e.food.per, e.grams)));
  const loggedDays = useMemo(() => new Set(state.log.map((e) => e.date)), [state.log]);
  const streakDays = streak(loggedDays, today);

  if (!goal) return null;
  const target = goal.result.goal;
  const left = Math.round(target - totals.kcal);
  const favKeys = new Set(state.favMeals.map((f) => itemsKey(f.items)));

  const title = day === today ? 'Vandaag' : day === addDays(today, -1) ? 'Gisteren' : formatShort(day);
  const fiberGoal = state.goals.fiberGoal || 30;
  const macros = [
    { name: 'Eiwit', eaten: totals.e, goal: goal.grams.e, color: C.protein },
    { name: 'Koolh.', eaten: totals.k, goal: goal.grams.k, color: C.carbs },
    { name: 'Vet', eaten: totals.v, goal: goal.grams.v, color: C.fat },
    { name: 'Vezels', eaten: totals.fiber ?? 0, goal: fiberGoal, color: C.fiber },
  ];
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map((d) => {
    const dayEntries = state.log.filter((e) => e.date === d);
    const f = dayEntries.reduce((s, e) => s + ((e.food.per.fiber ?? 0) * e.grams) / 100, 0);
    return { date: d, fiber: f, logged: dayEntries.length > 0 };
  });
  const weekLogged = week.filter((w) => w.logged);
  const weekAvg = weekLogged.length ? weekLogged.reduce((s, w) => s + w.fiber, 0) / weekLogged.length : 0;
  const missingFiber = entries.filter((e) => e.food.per.fiber == null).length;
  const micro = summarizeLog(entries, 1);
  const microList = MICROS.filter((m) => m.key !== 'na');
  const microHit = microList.filter((m) => micro.micro[m.key].amount >= (microTarget(m.key, state.profile) ?? Infinity)).length;

  return (
    <Screen withTabBar>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 2, marginLeft: -12 }}>
          <IconButton icon="back" label="Vorige dag" onPress={() => nav.setDay(addDays(day, -1))} color={C.ink} />
          <View>
            <T size={13} color={C.muted}>
              {formatLong(day)}
            </T>
            <H1>{title}</H1>
          </View>
          {day < today ? (
            <IconButton icon="forward" label="Volgende dag" onPress={() => nav.setDay(addDays(day, 1))} color={C.ink} />
          ) : null}
        </Row>
        <Row style={{ gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.card, borderRadius: 999 }}>
          <Icon name="flame" size={18} color={C.accent} />
          <T size={14} weight="semibold">
            {streakDays} {streakDays === 1 ? 'dag' : 'dagen'}
          </T>
        </Row>
      </Row>

      <Card style={{ gap: 16, padding: 20 }}>
        <Row style={{ gap: 20 }}>
          <Ring pct={totals.kcal / target} color={left < 0 ? C.warn : C.accent}>
            <T size={36} style={{ fontFamily: F.display, lineHeight: 40 }}>
              {nl(Math.abs(left))}
            </T>
            <T size={13} color={C.muted}>
              {left < 0 ? 'kcal te veel' : 'kcal over'}
            </T>
          </Ring>
          <View style={{ gap: 12, flex: 1 }}>
            <Stat label="Dagdoel" value={`${nl(target)} kcal`} />
            <Stat label="Gegeten" value={`${nl(totals.kcal)} kcal`} />
            <Stat label="Plan" value={goal.planLabel} />
          </View>
        </Row>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          {macros.map((m) => (
            <View key={m.name} style={{ flex: 1, gap: 6 }}>
              <T size={13} weight="semibold">
                {m.name}
              </T>
              <Bar pct={(m.eaten / Math.max(1, m.goal)) * 100} color={m.color} />
              <T size={12} color={C.muted}>
                {nl(m.eaten)} / {nl(m.goal)} g
              </T>
            </View>
          ))}
        </Row>
      </Card>

      <View style={{ gap: 8 }}>
        <H2>Maaltijden</H2>
        {MEALS.map((meal) => {
          const items = entries.filter((e) => e.meal === meal.id);
          const kcal = items.reduce((s, e) => s + (e.food.per.kcal * e.grams) / 100, 0);
          const favItems = items.map((e) => ({ food: e.food, grams: e.grams }));
          const isFav = items.length > 0 && favKeys.has(itemsKey(favItems));
          const expanded = open === meal.id && items.length > 0;
          return (
            <View key={meal.id} style={{ backgroundColor: C.card, borderRadius: 16, ...shadow }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityHint={items.length ? 'Toont de producten van deze maaltijd' : undefined}
                onPress={() => setOpen(expanded ? null : meal.id)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 16, paddingRight: 8, gap: 8 }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={15} weight="semibold">
                    {meal.label}
                  </T>
                  <T size={13} color={C.muted} numberOfLines={1}>
                    {items.length ? items.map((e) => e.food.name).join(', ') : 'Nog niets gelogd'}
                  </T>
                </View>
                <T size={15} weight="bold">
                  {nl(kcal)} kcal
                </T>
                {items.length ? (
                  <HeartButton
                    on={isFav}
                    label={isFav ? `${meal.label} uit favoriete maaltijden halen` : `${meal.label} als favoriete maaltijd opslaan`}
                    onPress={() => actions.toggleFavMeal(`${meal.label} van ${formatShort(day)}`, favItems)}
                  />
                ) : null}
                <IconButton
                  icon="plus"
                  label={`Toevoegen aan ${meal.label}`}
                  onPress={() => nav.push({ name: 'add', meal: meal.id, date: day })}
                  color={C.accent}
                  bg={C.accentTint}
                />
              </Pressable>
              {expanded ? (
                <View style={{ borderTopWidth: 1, borderTopColor: C.track, paddingVertical: 4 }}>
                  {items.map((e) => (
                    <Row key={e.id} style={{ paddingLeft: 16, paddingRight: 8 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${e.food.name} aanpassen`}
                        onPress={() =>
                          nav.push({ name: 'product', food: e.food, meal: e.meal, date: e.date, entryId: e.id, grams: e.grams })
                        }
                        style={{ flex: 1, paddingVertical: 8 }}
                      >
                        <T size={14} weight="semibold" numberOfLines={1}>
                          {e.food.name}
                        </T>
                        <T size={12} color={C.muted}>
                          {amountText(e.food, e.grams)} · {nl((e.food.per.kcal * e.grams) / 100)} kcal
                        </T>
                      </Pressable>
                      <IconButton icon="close" label={`${e.food.name} verwijderen`} onPress={() => actions.removeEntry(e.id)} iconSize={18} />
                    </Row>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <H2>Vezels</H2>
          <T size={13} color={C.muted}>
            gemiddeld {nl(weekAvg)} g · doel {nl(fiberGoal)} g
          </T>
        </Row>
        <Row style={{ alignItems: 'flex-end', gap: 8, height: 120 }}>
          {week.map((w) => {
            const pct = Math.min(1, w.fiber / fiberGoal);
            const hit = w.fiber >= fiberGoal;
            return (
              <View key={w.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <T size={11} weight="semibold" color={w.logged ? C.ink : C.muted}>
                  {w.logged ? nl(w.fiber) : '–'}
                </T>
                <View style={{ width: '100%', height: 80, borderRadius: 6, backgroundColor: C.track, justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <View style={{ height: `${pct * 100}%`, backgroundColor: hit ? C.accent : C.fiber, borderRadius: 6 }} />
                </View>
                <T size={11} weight={w.date === day ? 'bold' : 'regular'} color={w.date === day ? C.ink : C.muted}>
                  {weekday(w.date)}
                </T>
              </View>
            );
          })}
        </Row>
        {missingFiber > 0 ? (
          <T size={12} color={C.muted}>
            Van {missingFiber} {missingFiber === 1 ? 'product' : 'producten'} op deze dag zijn geen vezels bekend; die tellen als 0.
          </T>
        ) : null}
      </Card>

      <Pressable accessibilityRole="button" accessibilityLabel="Vitamines en mineralen bekijken" onPress={() => nav.push({ name: 'micros', date: day })}>
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <H2>Vitamines en mineralen</H2>
            <T size={13} weight="bold" color={C.accent}>
              Bekijken ›
            </T>
          </Row>
          {entries.length ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <T size={14}>Zout</T>
                <T size={13} color={micro.salt.amount > SALT_MAX ? C.warn : C.muted} weight={micro.salt.amount > SALT_MAX ? 'bold' : 'regular'}>
                  {nl(micro.salt.amount, 1)} / max. {SALT_MAX} g
                </T>
              </Row>
              <Bar pct={(micro.salt.amount / SALT_MAX) * 100} color={micro.salt.amount > SALT_MAX ? C.warn : C.accent} height={6} />
              <T size={13} color={C.muted}>
                {microHit} van de {microList.length} op de norm
                {micro.anyKnown < 0.9 ? ` · bekend voor ${nl(micro.anyKnown * 100)}% van je kcal` : ''}
              </T>
            </>
          ) : (
            <T size={13} color={C.muted}>
              Zout, verzadigd vet, 8 vitamines en 7 mineralen, per dag of gemiddeld per week.
            </T>
          )}
        </Card>
      </Pressable>
    </Screen>
  );
}

function weekday(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][new Date(y, m - 1, d, 12).getDay()];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T size={12} color={C.muted}>
        {label}
      </T>
      <T size={17} weight="bold" numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}
