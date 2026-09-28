import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { forGrams, nl, parseNumber, sumNutrition } from '../logic/calc';
import { Food, unitOf } from '../logic/off';
import { MealId, mealLabel, useApp } from '../store';
import { useNav } from '../nav';
import { useGoal } from '../useGoal';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Chip, H1, HeartButton, IconButton, MacroTile, Row, Screen, T } from '../ui';

export function ProductScreen({
  food,
  meal,
  date,
  entryId,
  grams: initial,
}: {
  food: Food;
  meal: MealId;
  date: string;
  entryId?: string;
  grams?: number;
}) {
  const { state, actions } = useApp();
  const nav = useNav();
  const goal = useGoal();
  const start = initial ?? food.servingG ?? 100;
  const [text, setText] = useState(String(Math.round(start)));

  const parsed = parseNumber(text);
  const valid = parsed != null && parsed > 0 && parsed <= 5000;
  const g = valid ? parsed! : 0;
  const n = forGrams(food.per, g);
  const fav = state.favorites.includes(food.id);

  // Wat er al op deze dag staat, zonder de regel die we nu bewerken.
  const dayTotals = useMemo(
    () =>
      sumNutrition(
        state.log.filter((e) => e.date === date && e.id !== entryId).map((e) => forGrams(e.food.per, e.grams)),
      ),
    [state.log, date, entryId],
  );

  const u = unitOf(food);
  const word = u === 'ml' ? 'ml' : 'gram';
  const setG = (v: number) => setText(String(Math.max(0, Math.round(v))));
  const presets: { label: string; g: number }[] = [];
  if (food.servingG) {
    presets.push({
      label: food.servingLabel ? `${food.servingLabel} · ${nl(food.servingG)} ${u}` : `Portie · ${nl(food.servingG)} ${u}`,
      g: food.servingG,
    });
  }
  const last = state.lastPortion[food.id];
  if (last && !presets.some((p) => Math.round(p.g) === Math.round(last))) presets.push({ label: `Vorige · ${nl(last)} ${u}`, g: last });
  if (!presets.some((p) => Math.round(p.g) === 100)) presets.push({ label: `100 ${u}`, g: 100 });

  const save = () => {
    if (!valid) return;
    if (entryId) actions.updateEntry(entryId, g);
    else actions.addEntry(date, meal, food, g);
    nav.home();
  };

  const remove = () => {
    if (entryId) actions.removeEntry(entryId);
    nav.home();
  };

  const left = goal ? Math.round(goal.result.goal - dayTotals.kcal - n.kcal) : null;

  return (
    <Screen>
      <BackHeader
        title=""
        onBack={nav.back}
        right={
          <HeartButton on={fav} onPress={() => actions.toggleFavorite(food)} label={fav ? 'Uit favorieten halen' : 'Als favoriet bewaren'} />
        }
      />
      <View style={{ gap: 6 }}>
        <H1 style={{ fontSize: 28 }}>{food.name}</H1>
        <T size={13} color={C.muted}>
          {food.brand ? `${food.brand} · ` : ''}
          {food.source === 'off' ? 'Open Food Facts' : 'Eigen product'} · per 100 {u}: {nl(food.per.kcal)} kcal
        </T>
      </View>

      <Card style={{ padding: 20, gap: 16 }}>
        <T size={14} weight="semibold" color={C.muted}>
          Portie
        </T>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="minus" label={`10 ${word} minder`} onPress={() => setG(g - 10)} color={C.ink} bg={C.track} size={48} />
          <Row style={{ gap: 8 }}>
            <TextInput
              accessibilityLabel={`Portie in ${word}`}
              value={text}
              onChangeText={setText}
              keyboardType="number-pad"
              selectTextOnFocus
              style={{
                width: 128,
                height: 56,
                borderWidth: 1.5,
                borderColor: valid ? C.line : C.warn,
                borderRadius: 14,
                backgroundColor: C.bg,
                fontFamily: F.display,
                fontSize: 34,
                color: C.ink,
                textAlign: 'center',
                paddingVertical: 0,
              }}
            />
            <T size={18} weight="semibold" color={C.muted}>
              {word}
            </T>
          </Row>
          <IconButton icon="plus" label={`10 ${word} meer`} onPress={() => setG(g + 10)} color={C.ink} bg={C.track} size={48} />
        </Row>
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <Chip key={p.label} wide label={p.label} on={Math.round(p.g) === Math.round(g)} onPress={() => setG(p.g)} />
          ))}
        </Row>
      </Card>

      <Card style={{ padding: 20, gap: 16 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T size={14} weight="semibold" color={C.muted}>
            Deze portie
          </T>
          <T size={24} weight="bold">
            {nl(n.kcal)} kcal
          </T>
        </Row>
        <Row style={{ gap: 10 }}>
          <MacroTile label="Eiwit" value={`${nl(n.e, 1)} g`} color={C.protein} />
          <MacroTile label="Koolhydraten" value={`${nl(n.k, 1)} g`} color={C.carbs} />
          <MacroTile label="Vet" value={`${nl(n.v, 1)} g`} color={C.fat} />
        </Row>
      </Card>

      {goal && left != null ? (
        <View style={{ borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.accentTint, gap: 4 }}>
          <T size={14} weight="bold">
            {left >= 0 ? `Daarna nog ${nl(left)} kcal over` : `Daarna ${nl(-left)} kcal boven je doel`}
          </T>
          <T size={13} color={C.soft}>
            Eiwit die dag: {nl(dayTotals.e + n.e)} van {nl(goal.grams.e)} g
          </T>
        </View>
      ) : null}

      <Button label={entryId ? 'Opslaan' : `Toevoegen aan ${mealLabel(meal)}`} onPress={save} disabled={!valid} />
      {entryId ? <Button variant="danger" label="Verwijderen" onPress={remove} /> : null}
    </Screen>
  );
}
