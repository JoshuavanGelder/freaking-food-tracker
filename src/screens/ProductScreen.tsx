import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { forGrams, nl, parseNumber, sumNutrition } from '../logic/calc';
import { Food, portionCount, unitOf } from '../logic/off';
import { MealId, mealLabel, useApp } from '../store';
import { useNav } from '../nav';
import { useGoal } from '../useGoal';
import { NEVO, withNevoData } from '../data/nevo';
import { PortionMicros } from './MicrosScreen';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Chip, H1, HeartButton, IconButton, MacroTile, Row, Screen, Segmented, T } from '../ui';

function fmtCount(x: number): string {
  return x.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
}

export function ProductScreen({
  food: routeFood,
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
  // Oudere NEVO-producten (uit recent of favorieten) krijgen de micro's alsnog.
  const food = useMemo(() => withNevoData(routeFood), [routeFood]);
  const start = initial ?? food.servingG ?? 100;
  const startCount = portionCount(food, start);
  const [mode, setMode] = useState<'portie' | 'gram'>(food.servingG && (initial == null || startCount != null) ? 'portie' : 'gram');
  const [text, setText] = useState(String(Math.round(start)));
  const [countText, setCountText] = useState(fmtCount(startCount ?? 1));
  const [sizeText, setSizeText] = useState(food.servingG ? String(Math.round(food.servingG)) : '');

  const size = parseNumber(sizeText);
  const sizeOk = size != null && size > 0 && size <= 5000;
  const count = parseNumber(countText);
  const countOk = count != null && count > 0 && count <= 50;
  const parsed = mode === 'portie' ? (sizeOk && countOk ? count! * size! : null) : parseNumber(text);
  const valid = parsed != null && parsed > 0 && parsed <= 5000;
  const g = valid ? parsed! : 0;
  const n = forGrams(food.per, g);
  const fav = state.favorites.includes(food.id);
  // Bij het samenstellen van een favoriete maaltijd voegen we toe aan die maaltijd in plaats van aan je dag.
  const pickMeal = !entryId && nav.pickFor ? state.favMeals.find((m) => m.id === nav.pickFor) : undefined;

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
  const setCount = (v: number) => setCountText(fmtCount(Math.max(0.5, Math.round(v * 2) / 2)));
  const switchMode = (m: 'portie' | 'gram') => {
    if (m === mode) return;
    if (m === 'gram' && valid) setG(g);
    if (m === 'portie' && valid && sizeOk) setCount(g / size!);
    setMode(m);
  };
  const portionWhat =
    food.servingLabel && /^1\s/.test(food.servingLabel) ? food.servingLabel.replace(/^1\s+/, '') : 'portie';
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
  if (food.packageG && food.packageG <= 1000 && !presets.some((p) => Math.round(p.g) === Math.round(food.packageG!))) {
    presets.push({ label: `Hele verpakking · ${nl(food.packageG)} ${u}`, g: food.packageG });
  }

  const save = () => {
    if (!valid) return;
    // Nieuwe portiegrootte onthouden voor dit product.
    let f = food;
    if (mode === 'portie' && sizeOk && Math.round(size!) !== Math.round(food.servingG ?? -1)) {
      f = { ...food, servingG: size!, servingLabel: undefined };
      actions.saveFood(f);
    }
    if (pickMeal) {
      actions.addFavMealItem(pickMeal.id, f, g);
      nav.popTo('favmeal');
      return;
    }
    if (entryId) actions.updateEntry(entryId, g);
    else actions.addEntry(date, meal, f, g);
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
          {food.source === 'off' ? 'Open Food Facts' : food.source === 'nevo' ? 'NEVO (RIVM)' : 'Eigen product'} · per 100 {u}: {nl(food.per.kcal)} kcal
        </T>
        {food.source === 'nevo' ? (
          <T size={11} color={C.muted}>
            Gebaseerd op gegevens van {NEVO.source}
          </T>
        ) : null}
        {food.note ? (
          <T size={12} color={C.warn}>
            {food.note}
          </T>
        ) : null}
        {entryId ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.push({ name: 'manual', meal, date, base: food })}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
        >
          <T size={13} weight="bold" color={C.accent}>
            Klopt er iets niet? Waarden aanpassen
          </T>
        </Pressable>
        )}
      </View>

      <Card style={{ padding: 20, gap: 16 }}>
        <Segmented<'portie' | 'gram'>
          options={[
            { value: 'portie', label: 'Aantal porties' },
            { value: 'gram', label: u === 'ml' ? 'Milliliter' : 'Gram' },
          ]}
          value={mode}
          onChange={switchMode}
        />
        {mode === 'portie' ? (
          <>
            <Stepper
              value={countText}
              onChange={setCountText}
              onMinus={() => setCount((count ?? 1) - (count != null && count <= 1 ? 0.5 : 1))}
              onPlus={() => setCount((count ?? 0) + 1)}
              unit={count === 1 ? portionWhat : portionWhat === 'portie' ? 'porties' : `× ${portionWhat}`}
              label="Aantal porties"
              ok={countOk}
              keyboardType="decimal-pad"
            />
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {[0.5, 1, 2, 3].map((c) => (
                <Chip key={c} label={fmtCount(c)} on={count === c} onPress={() => setCount(c)} />
              ))}
            </Row>
            <Row style={{ gap: 10 }}>
              <T size={14} color={C.muted} style={{ flex: 1 }}>
                {food.servingLabel ? `1 ${portionWhat} is` : '1 portie is'}
              </T>
              <View style={{ width: 120 }}>
                <TextInput
                  accessibilityLabel={`Portiegrootte in ${word}`}
                  value={sizeText}
                  onChangeText={setSizeText}
                  keyboardType="number-pad"
                  placeholder="?"
                  placeholderTextColor={C.warn}
                  style={{
                    height: 44,
                    borderWidth: 1.5,
                    borderColor: sizeOk ? C.line : C.warn,
                    borderRadius: 12,
                    backgroundColor: C.card,
                    paddingLeft: 12,
                    paddingRight: 40,
                    fontFamily: F.semibold,
                    fontSize: 16,
                    color: C.ink,
                    textAlign: 'right',
                  }}
                />
                <T size={14} color={C.muted} style={{ position: 'absolute', right: 12, top: 12 }}>
                  {u}
                </T>
              </View>
            </Row>
            {!sizeOk ? (
              <T size={13} weight="semibold" color={C.warn}>
                Vul in hoeveel {word} één portie is. De app onthoudt dit voor dit product.
              </T>
            ) : (
              <T size={13} color={C.muted}>
                Samen {nl(g)} {u}
              </T>
            )}
          </>
        ) : (
          <>
            <Stepper
              value={text}
              onChange={setText}
              onMinus={() => setG(g - 10)}
              onPlus={() => setG(g + 10)}
              unit={word}
              label={`Hoeveelheid in ${word}`}
              ok={valid}
              keyboardType="number-pad"
            />
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {presets.map((p) => (
                <Chip key={p.label} wide label={p.label} on={Math.round(p.g) === Math.round(g)} onPress={() => setG(p.g)} />
              ))}
            </Row>
          </>
        )}
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
        <Row style={{ gap: 8 }}>
          <MacroTile label="Eiwit" value={`${nl(n.e, 1)} g`} color={C.protein} />
          <MacroTile label="Koolh." value={`${nl(n.k, 1)} g`} color={C.carbs} />
          <MacroTile label="Vet" value={`${nl(n.v, 1)} g`} color={C.fat} />
          <MacroTile label="Vezels" value={n.fiber != null ? `${nl(n.fiber, 1)} g` : '?'} color={C.fiber} />
        </Row>
        {n.fiber == null ? (
          <T size={12} color={C.muted}>
            Van dit product zijn geen vezels bekend.
          </T>
        ) : null}
      </Card>

      {valid ? <PortionMicros per={n} profile={state.profile} /> : null}

      {goal && left != null && !pickMeal ? (
        <View style={{ borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.accentTint, gap: 4 }}>
          <T size={14} weight="bold">
            {left >= 0 ? `Daarna nog ${nl(left)} kcal over` : `Daarna ${nl(-left)} kcal boven je doel`}
          </T>
          <T size={13} color={C.soft}>
            Die dag: eiwit {nl(dayTotals.e + n.e)}/{nl(goal.grams.e)} g · koolh. {nl(dayTotals.k + n.k)}/{nl(goal.grams.k)} g
          </T>
          <T size={13} color={C.soft}>
            vet {nl(dayTotals.v + n.v)}/{nl(goal.grams.v)} g · vezels {nl((dayTotals.fiber ?? 0) + (n.fiber ?? 0))}/{nl(state.goals.fiberGoal || 30)} g
          </T>
        </View>
      ) : null}

      <Button
        label={entryId ? 'Opslaan' : pickMeal ? `Toevoegen aan ${pickMeal.name}` : `Toevoegen aan ${mealLabel(meal)}`}
        onPress={save}
        disabled={!valid}
      />
      {entryId ? <Button variant="danger" label="Verwijderen" onPress={remove} /> : null}
    </Screen>
  );
}

function Stepper({
  value,
  onChange,
  onMinus,
  onPlus,
  unit,
  label,
  ok,
  keyboardType,
}: {
  value: string;
  onChange: (t: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  unit: string;
  label: string;
  ok: boolean;
  keyboardType: 'number-pad' | 'decimal-pad';
}) {
  return (
    <Row style={{ justifyContent: 'space-between', gap: 8 }}>
      <IconButton icon="minus" label="Minder" onPress={onMinus} color={C.ink} bg={C.track} size={48} />
      <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          selectTextOnFocus
          style={{
            width: 128,
            height: 56,
            borderWidth: 1.5,
            borderColor: ok ? C.line : C.warn,
            borderRadius: 14,
            backgroundColor: C.bg,
            fontFamily: F.display,
            fontSize: 34,
            color: C.ink,
            textAlign: 'center',
            paddingVertical: 0,
          }}
        />
        <T size={14} weight="semibold" color={C.muted} numberOfLines={1}>
          {unit}
        </T>
      </View>
      <IconButton icon="plus" label="Meer" onPress={onPlus} color={C.ink} bg={C.track} size={48} />
    </Row>
  );
}
