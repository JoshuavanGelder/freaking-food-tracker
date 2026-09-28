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
  const macros = [
    { name: 'Eiwit', eaten: totals.e, goal: goal.grams.e, color: C.protein },
    { name: 'Koolhydraten', eaten: totals.k, goal: goal.grams.k, color: C.carbs },
    { name: 'Vet', eaten: totals.v, goal: goal.grams.v, color: C.fat },
  ];

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
        <Row style={{ gap: 14, alignItems: 'flex-start' }}>
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
    </Screen>
  );
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
