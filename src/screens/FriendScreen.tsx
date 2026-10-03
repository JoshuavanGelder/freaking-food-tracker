import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Friend, FriendDay, FriendEntry, friendDays, friendEntries, friendFavorites, friendWeights, removeFriend, shares } from '../cloud';
import { addDays, dateKey, formatLong, formatShort, nl } from '../logic/calc';
import { FriendFavorites, mealKcal } from '../logic/friends';
import { Food } from '../logic/off';
import { amountText } from '../logic/off';
import { MEALS, MealId, itemsKey, mealLabel, useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Bar, Button, Card, HeartButton, IconButton, Row, Screen, T } from '../ui';
import { FriendFavMeal } from '../logic/friends';
import { MealSheet } from './MealSheet';

/** Eén vriend: dagtotalen per dag, wat hij at (als hij dat deelt) en zijn gewicht. */
export function FriendScreen({ friend }: { friend: Friend }) {
  const nav = useNav();
  const today = dateKey(new Date());
  const [day, setDay] = useState(today);
  const [total, setTotal] = useState<FriendDay | null>(null);
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [weights, setWeights] = useState<{ date: string; kg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const name = friend.name || 'Je vriend';
  const eats = shares(friend, 'totals') || shares(friend, 'log');
  const target = friend.target;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      eats ? friendDays(friend.id, day, day) : Promise.resolve([]),
      shares(friend, 'log') ? friendEntries(friend.id, day) : Promise.resolve([]),
    ])
      .then(([d, e]) => {
        if (!alive) return;
        setTotal(d[0] ?? null);
        setEntries(e);
      })
      .catch((e: any) => alive && setError(e?.message ?? 'Laden lukte niet.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [friend.id, day]);

  useEffect(() => {
    if (shares(friend, 'weight')) friendWeights(friend.id, addDays(today, -60)).then(setWeights).catch(() => {});
  }, [friend.id]);

  const title = day === today ? 'Vandaag' : day === addDays(today, -1) ? 'Gisteren' : formatShort(day);
  const macros = [
    { label: 'Eiwit', value: total?.e ?? 0, goal: target?.e, color: C.protein },
    { label: 'Koolh.', value: total?.k ?? 0, goal: target?.k, color: C.carbs },
    { label: 'Vet', value: total?.v ?? 0, goal: target?.v, color: C.fat },
    { label: 'Vezels', value: total?.fiber ?? 0, goal: target?.fiber, color: C.fiber },
  ];
  const recentWeights = [...weights].reverse().slice(0, 10);

  return (
    <Screen>
      <BackHeader title={name} onBack={nav.back} />

      {eats ? (
        <>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <IconButton icon="back" label="Vorige dag" onPress={() => setDay(addDays(day, -1))} color={C.ink} />
            <View style={{ alignItems: 'center' }}>
              <T size={17} weight="bold">
                {title}
              </T>
              <T size={12} color={C.muted}>
                {formatLong(day)}
              </T>
            </View>
            {day < today ? (
              <IconButton icon="forward" label="Volgende dag" onPress={() => setDay(addDays(day, 1))} color={C.ink} />
            ) : (
              <View style={{ width: 44 }} />
            )}
          </Row>

          <Card style={{ gap: 10 }}>
            {loading ? (
              <ActivityIndicator color={C.accent} />
            ) : !total ? (
              <T size={14} color={C.muted}>
                {name} heeft deze dag niets gelogd.
              </T>
            ) : (
              <>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T size={28} weight="bold">
                    {nl(total.kcal)} kcal
                  </T>
                  {target ? (
                    <T size={14} color={C.muted}>
                      van {nl(target.kcal)} ({nl((total.kcal / target.kcal) * 100)}%)
                    </T>
                  ) : null}
                </Row>
                {target ? <Bar pct={(total.kcal / target.kcal) * 100} color={total.kcal > target.kcal * 1.1 ? C.warn : C.accent} height={10} /> : null}
                {macros.map((m) => (
                  <View key={m.label} style={{ gap: 4 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T size={13}>{m.label}</T>
                      <T size={13} weight="semibold">
                        {nl(m.value)}
                        {m.goal ? ` / ${nl(m.goal)}` : ''} g
                      </T>
                    </Row>
                    {m.goal ? <Bar pct={(m.value / m.goal) * 100} color={m.color} height={6} /> : null}
                  </View>
                ))}
              </>
            )}
          </Card>

          {shares(friend, 'log') ? (
            total && entries.length ? (
              <Card style={{ gap: 10 }}>
                {MEALS.map((m) => {
                  const items = entries.filter((e) => e.meal === m.id);
                  if (!items.length) return null;
                  const kcal = items.reduce((s, e) => s + e.kcal, 0);
                  return (
                    <View key={m.id} style={{ gap: 4 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T size={15} weight="bold">
                          {m.label}
                        </T>
                        <T size={14} weight="semibold">
                          {nl(kcal)} kcal
                        </T>
                      </Row>
                      {items.map((e, i) => (
                        <Row key={i} style={{ justifyContent: 'space-between', gap: 8 }}>
                          <T size={13} color={C.muted} style={{ flex: 1 }}>
                            {e.name}
                            {e.brand ? ` (${e.brand})` : ''} · {nl(e.grams)} {e.unit}
                          </T>
                          <T size={13} color={C.muted}>
                            {nl(e.kcal)}
                          </T>
                        </Row>
                      ))}
                    </View>
                  );
                })}
              </Card>
            ) : null
          ) : (
            <T size={13} color={C.muted}>
              {name} deelt alleen dagtotalen, niet wat hij precies eet.
            </T>
          )}
        </>
      ) : (
        <Card>
          <T size={14} color={C.muted}>
            {name} deelt geen eten.
          </T>
        </Card>
      )}

      {error ? (
        <T size={13} color={C.warn}>
          {error}
        </T>
      ) : null}

      {shares(friend, 'weight') ? (
        <Card style={{ gap: 6 }}>
          <T size={14} weight="semibold" color={C.muted}>
            Gewicht
          </T>
          {recentWeights.length ? (
            recentWeights.map((w) => (
              <Row key={w.date} style={{ justifyContent: 'space-between' }}>
                <T size={14}>{formatShort(w.date)}</T>
                <T size={14} weight="semibold">
                  {nl(w.kg, 1)} kg
                </T>
              </Row>
            ))
          ) : (
            <T size={14} color={C.muted}>
              Nog geen gewichten in de afgelopen twee maanden.
            </T>
          )}
        </Card>
      ) : null}

      {shares(friend, 'favorites') ? <FavoritesCard friend={friend} name={name} /> : null}

      {confirm ? (
        <Card style={{ gap: 8 }}>
          <T size={14} style={{ lineHeight: 20 }}>
            {name} verwijderen als vriend? Jullie zien dan elkaars voortgang niet meer. Je kunt elkaar later weer toevoegen
            met de code.
          </T>
          <Row style={{ gap: 8 }}>
            <Button
              small
              variant="danger"
              label="Verwijderen"
              onPress={async () => {
                try {
                  await removeFriend(friend.id);
                  nav.back();
                } catch (e: any) {
                  setError(e?.message ?? 'Verwijderen lukte niet.');
                }
              }}
              style={{ flex: 1 }}
            />
            <Button small variant="outline" label="Annuleren" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button small variant="ghost" label="Vriend verwijderen" onPress={() => setConfirm(true)} />
      )}
    </Screen>
  );
}

/** Favoriete producten en maaltijden van een vriend: bekijken, aan een maaltijd van vandaag toevoegen of bewaren. */
function FavoritesCard({ friend, name }: { friend: Friend; name: string }) {
  const nav = useNav();
  const { state, actions } = useApp();
  const [favs, setFavs] = useState<FriendFavorites | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Wat er in de popup wordt toegevoegd: een hele maaltijd of één product.
  const [sheet, setSheet] = useState<{ meal: FriendFavMeal } | { food: Food } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = (meal: MealId, date: string, dayLabel: string) => {
    if (!sheet) return;
    if ('meal' in sheet) {
      const fm = sheet.meal;
      actions.addFavMealTo({ id: fm.id, name: fm.name, items: fm.items }, date, meal);
      setDone(`${fm.name} staat bij ${mealLabel(meal)} (${dayLabel}).`);
      setSheet(null);
    } else {
      const food = sheet.food;
      setSheet(null);
      nav.setDay(date);
      nav.push({ name: 'product', food, meal, date });
    }
  };

  useEffect(() => {
    let alive = true;
    friendFavorites(friend.id)
      .then((f) => alive && setFavs(f))
      .catch((e: any) => alive && setError(e?.message ?? 'Laden lukte niet.'));
    return () => {
      alive = false;
    };
  }, [friend.id]);

  const myMeals = new Set(state.favMeals.map((f) => itemsKey(f.items)));
  const empty = favs && !favs.foods.length && !favs.meals.length;

  return (
    <Card style={{ gap: 10 }}>
      <T size={14} weight="semibold" color={C.muted}>
        Favorieten van {name}
      </T>

      {!favs && !error ? <ActivityIndicator color={C.accent} /> : null}
      {error ? (
        <T size={13} color={C.warn}>
          {error}
        </T>
      ) : null}
      {empty ? (
        <T size={13} color={C.muted}>
          {name} heeft nog geen favorieten, of ze zijn nog niet gesynchroniseerd.
        </T>
      ) : null}

      {favs && !empty ? (
        <>
          {favs.meals.length ? (
            <View style={{ gap: 8 }}>
              <T size={13} weight="bold">
                Maaltijden
              </T>
              {favs.meals.map((fm) => (
                <View key={fm.id + fm.name} style={{ gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <T size={15} weight="semibold">
                        {fm.name}
                      </T>
                      <T size={12} color={C.muted}>
                        {fm.items.length} {fm.items.length === 1 ? 'product' : 'producten'} · {nl(mealKcal(fm.items))} kcal
                      </T>
                    </View>
                    <HeartButton
                      on={myMeals.has(itemsKey(fm.items))}
                      label={myMeals.has(itemsKey(fm.items)) ? 'Uit mijn favorieten halen' : 'Bewaren in mijn favoriete maaltijden'}
                      onPress={() => actions.toggleFavMeal(fm.name, fm.items)}
                    />
                    <Button
                      small
                      variant="outline"
                      label="Toevoegen"
                      onPress={() => {
                        setDone(null);
                        setSheet({ meal: fm });
                      }}
                    />
                  </Row>
                  <T size={12} color={C.muted}>
                    {fm.items.map((it) => `${it.food.name} ${amountText(it.food, it.grams)}`).join(' · ')}
                  </T>
                </View>
              ))}
            </View>
          ) : null}

          {favs.foods.length ? (
            <View style={{ gap: 8 }}>
              <T size={13} weight="bold">
                Producten
              </T>
              {favs.foods.map((f) => (
                <Row key={f.id} style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <T size={15} weight="semibold" numberOfLines={2}>
                      {f.name}
                      {f.brand ? ` (${f.brand})` : ''}
                    </T>
                    <T size={12} color={C.muted}>
                      {nl(f.per.kcal)} kcal per 100 {f.unit === 'ml' ? 'ml' : 'g'}
                    </T>
                  </View>
                  <HeartButton
                    on={state.favorites.includes(f.id)}
                    label={state.favorites.includes(f.id) ? 'Uit mijn favorieten halen' : 'Bewaren in mijn favorieten'}
                    onPress={() => actions.toggleFavorite(f)}
                  />
                  <Button
                    small
                    variant="outline"
                    label="Toevoegen"
                    onPress={() => {
                      setDone(null);
                      setSheet({ food: f });
                    }}
                  />
                </Row>
              ))}
            </View>
          ) : null}

          {done ? (
            <T size={13} weight="semibold" color={C.accent}>
              {done}
            </T>
          ) : null}
        </>
      ) : null}

      <MealSheet
        visible={!!sheet}
        title={sheet ? ('meal' in sheet ? sheet.meal.name : sheet.food.name) : ''}
        subtitle={
          sheet && 'meal' in sheet
            ? `${sheet.meal.items.length} ${sheet.meal.items.length === 1 ? 'product' : 'producten'} · ${nl(mealKcal(sheet.meal.items))} kcal`
            : sheet
              ? 'Je kiest daarna de hoeveelheid.'
              : undefined
        }
        onPick={pick}
        onClose={() => setSheet(null)}
      />
    </Card>
  );
}
