import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { nl } from '../logic/calc';
import { Food, amountText, searchFoods, unitOf } from '../logic/off';
import { nevoToFood, searchIn } from '../logic/nevo';
import { NEVO } from '../data/nevo';
import { MealId, mealLabel, useApp } from '../store';
import { useNav } from '../nav';
import { C, F, shadow } from '../theme';
import { Icon } from '../icons';
import { BackHeader, Button, Empty, HeartButton, IconButton, Row, Screen, Segmented, T } from '../ui';

type TabId = 'recent' | 'fav' | 'eigen';

export function AddScreen({ meal, date }: { meal: MealId; date: string }) {
  const { state, actions } = useApp();
  const nav = useNav();
  const [tab, setTab] = useState<TabId>(state.recent.length ? 'recent' : 'fav');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreNevo, setMoreNevo] = useState(false);
  const [editingMeal, setEditingMeal] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');

  const startRename = (id: string, name: string) => {
    setEditingMeal(id);
    setMealName(name);
  };
  const saveRename = () => {
    if (editingMeal && mealName.trim()) actions.renameFavMeal(editingMeal, mealName);
    setEditingMeal(null);
  };

  // Basisproducten uit NEVO zoeken we direct tijdens het typen (staat in de app, dus ook offline).
  const searching = query.trim().length >= 2;
  const nevoHits = useMemo(() => (searching ? searchIn(NEVO.items, query, 40).map(nevoToFood) : []), [query, searching]);

  const onType = (t: string) => {
    setQuery(t);
    setResults(null);
    setError(null);
    setMoreNevo(false);
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchFoods(q));
    } catch (e: any) {
      setError(e?.message ?? 'Zoeken lukte niet.');
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setQuery('');
    setResults(null);
    setError(null);
    setMoreNevo(false);
  };

  const open = (food: Food) => nav.push({ name: 'product', food, meal, date, grams: state.lastPortion[food.id] });
  const byIds = (ids: string[]) => ids.map((id) => state.foods[id]).filter(Boolean) as Food[];
  const own = Object.values(state.foods).filter((f) => f.source === 'eigen');

  const list = (foods: Food[]) => (
    <View style={{ gap: 8 }}>
      {foods.map((f) => (
        <FoodRow
          key={f.id}
          food={f}
          portion={state.lastPortion[f.id]}
          fav={state.favorites.includes(f.id)}
          onFav={() => actions.toggleFavorite(f)}
          onOpen={() => open(f)}
        />
      ))}
    </View>
  );

  return (
    <Screen>
      <BackHeader title={`Toevoegen aan ${mealLabel(meal)}`} onBack={nav.back} />

      <View>
        <View style={{ position: 'absolute', left: 16, top: 14, zIndex: 1 }}>
          <Icon name="search" size={20} color={C.muted} />
        </View>
        <TextInput
          accessibilityLabel="Zoek een product"
          value={query}
          onChangeText={onType}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Zoek een product, bijv. kwark"
          placeholderTextColor="#9A9D96"
          style={{
            height: 48,
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 14,
            backgroundColor: C.card,
            paddingLeft: 46,
            paddingRight: query ? 48 : 16,
            fontFamily: F.regular,
            fontSize: 15,
            color: C.ink,
          }}
        />
        {query ? (
          <View style={{ position: 'absolute', right: 2, top: 2 }}>
            <IconButton icon="close" label="Zoekopdracht wissen" onPress={clear} iconSize={18} />
          </View>
        ) : null}
      </View>

      <Button label="Scan barcode" icon="barcode" onPress={() => nav.push({ name: 'scan', meal, date })} />

      {searching ? (
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={13} weight="bold" color={C.muted}>
              {nevoHits.length ? `Basisproducten (NEVO) · ${nevoHits.length}${nevoHits.length === 40 ? '+' : ''}` : 'Zoekresultaten'}
            </T>
            <Pressable onPress={clear} hitSlop={10}>
              <T size={13} weight="bold" color={C.accent}>
                Terug naar lijsten
              </T>
            </Pressable>
          </Row>
          {nevoHits.length ? list(moreNevo ? nevoHits : nevoHits.slice(0, 8)) : null}
          {nevoHits.length > 8 && !moreNevo ? (
            <Button small variant="ghost" label={`Meer basisproducten tonen`} onPress={() => setMoreNevo(true)} />
          ) : null}

          {busy ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
          ) : error ? (
            <Empty title="Merkproducten zoeken lukte niet" text={error}>
              <Button small variant="outline" label="Opnieuw proberen" onPress={search} />
            </Empty>
          ) : results ? (
            <>
              <T size={13} weight="bold" color={C.muted} style={{ marginTop: 8 }}>
                Merkproducten (Open Food Facts) · {results.length}
              </T>
              {results.length ? list(results) : null}
              {results.length || nevoHits.length ? (
                <Button small variant="ghost" label="Staat het er niet bij? Zelf invoeren" onPress={() => nav.push({ name: 'manual', meal, date })} />
              ) : (
                <Empty title="Niets gevonden" text="Probeer een ander woord, of voer het product zelf in.">
                  <Button small variant="outline" label="Zelf invoeren" onPress={() => nav.push({ name: 'manual', meal, date })} />
                </Empty>
              )}
            </>
          ) : (
            <Button
              small
              variant="outline"
              icon="search"
              label={`Zoek merken: "${query.trim()}"`}
              onPress={search}
              style={{ marginTop: nevoHits.length ? 4 : 0 }}
            />
          )}
        </View>
      ) : (
        <>
          <Segmented<TabId>
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'fav', label: 'Favorieten' },
              { value: 'eigen', label: 'Eigen' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'recent' ? (
            state.recent.length ? (
              list(byIds(state.recent))
            ) : (
              <Empty title="Nog niets gegeten" text="Zoek of scan een product. Wat je toevoegt, verschijnt hier voor de volgende keer." />
            )
          ) : null}

          {tab === 'fav' ? (
            <View style={{ gap: 8 }}>
              {state.favMeals.length ? (
                <>
                  <T size={13} weight="bold" color={C.muted}>
                    Maaltijden
                  </T>
                  {state.favMeals.map((m) => {
                    const kcal = m.items.reduce((s, i) => s + (i.food.per.kcal * i.grams) / 100, 0);
                    const card = { backgroundColor: C.card, borderRadius: 14, paddingVertical: 10, paddingLeft: 16, paddingRight: 8, gap: 6, ...shadow };
                    if (editingMeal === m.id) {
                      return (
                        <View key={m.id} style={card}>
                          <TextInput
                            accessibilityLabel="Naam van de maaltijd"
                            value={mealName}
                            onChangeText={setMealName}
                            onSubmitEditing={saveRename}
                            returnKeyType="done"
                            autoFocus
                            selectTextOnFocus
                            maxLength={60}
                            style={{
                              height: 44,
                              marginRight: 8,
                              borderWidth: 1,
                              borderColor: C.accent,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              fontFamily: F.regular,
                              fontSize: 15,
                              color: C.ink,
                            }}
                          />
                          <Row style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <Button small variant="ghost" label="Annuleren" onPress={() => setEditingMeal(null)} />
                            <Button small label="Opslaan" onPress={saveRename} style={{ borderRadius: 999, paddingHorizontal: 14 }} />
                          </Row>
                        </View>
                      );
                    }
                    return (
                      <View key={m.id} style={card}>
                        <View style={{ gap: 2, paddingRight: 8 }}>
                          <T size={15} weight="semibold" numberOfLines={2}>
                            {m.name}
                          </T>
                          <T size={13} color={C.muted} numberOfLines={2}>
                            {m.items.map((i) => i.food.name).join(', ')} · {nl(kcal)} kcal
                          </T>
                        </View>
                        <Row style={{ gap: 6 }}>
                          <IconButton icon="edit" label={`${m.name} hernoemen`} onPress={() => startRename(m.id, m.name)} iconSize={18} />
                          <IconButton icon="close" label={`${m.name} uit favorieten halen`} onPress={() => actions.removeFavMeal(m.id)} iconSize={18} />
                          <View style={{ flex: 1 }} />
                          <Button
                            small
                            icon="plus"
                            label="Alles"
                            onPress={() => {
                              actions.addFavMealTo(m, date, meal);
                              nav.home();
                            }}
                            style={{ borderRadius: 999, paddingHorizontal: 14 }}
                          />
                        </Row>
                      </View>
                    );
                  })}
                  <T size={13} weight="bold" color={C.muted} style={{ marginTop: 4 }}>
                    Producten
                  </T>
                </>
              ) : null}
              {state.favorites.length ? (
                list(byIds(state.favorites))
              ) : (
                <Empty
                  title="Nog geen favorieten"
                  text="Tik op het hartje bij een product om het hier te bewaren. Bij Vandaag kun je met het hartje een hele maaltijd opslaan."
                />
              )}
            </View>
          ) : null}

          {tab === 'eigen' ? (
            <View style={{ gap: 8 }}>
              {own.length ? list(own) : null}
              <Empty
                title={own.length ? 'Nog iets missen?' : 'Nog geen eigen producten'}
                text="Staat iets niet in de database? Voer de voedingswaarden van het etiket in en bewaar het hier. Recepten komen in fase 2."
              >
                <Button small variant="outline" label="Product maken" onPress={() => nav.push({ name: 'manual', meal, date })} />
              </Empty>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function FoodRow({
  food,
  portion,
  fav,
  onFav,
  onOpen,
}: {
  food: Food;
  portion?: number;
  fav: boolean;
  onFav: () => void;
  onOpen: () => void;
}) {
  const u = unitOf(food);
  const p = portion ?? food.servingG;
  const sub = p ? `${amountText(food, p)} · ${nl((food.per.kcal * p) / 100)} kcal` : `${nl(food.per.kcal)} kcal per 100 ${u}`;
  return (
    <Row style={{ backgroundColor: C.card, borderRadius: 14, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, gap: 4, ...shadow }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${food.name} bekijken`} onPress={onOpen} style={{ flex: 1, gap: 2 }}>
        <T size={15} weight="semibold" numberOfLines={1}>
          {food.name}
        </T>
        <T size={13} color={C.muted} numberOfLines={1}>
          {food.brand ? `${food.brand} · ` : ''}
          {sub}
        </T>
      </Pressable>
      <HeartButton on={fav} onPress={onFav} label={fav ? `${food.name} uit favorieten halen` : `${food.name} als favoriet bewaren`} />
      <IconButton icon="plus" label={`${food.name} toevoegen`} onPress={onOpen} color={C.accent} bg={C.accentTint} />
    </Row>
  );
}
