import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { forGrams, nl, parseNumber, sumNutrition } from '../logic/calc';
import { unitOf } from '../logic/off';
import { mealForNow, useApp } from '../store';
import type { FavMealItem } from '../store';
import { useNav } from '../nav';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Field, IconButton, MacroTile, Row, Screen, T } from '../ui';

/**
 * Een favoriete maaltijd aanpassen: naam, hoeveelheden, producten weghalen en toevoegen.
 * Elke wijziging wordt direct bewaard (zoals bij Doelen), zodat er niets verloren gaat
 * als je even een product gaat zoeken.
 */
export function FavMealScreen({ id }: { id: string }) {
  const { state, actions } = useApp();
  const nav = useNav();
  const meal = state.favMeals.find((m) => m.id === id);
  const [name, setName] = useState(meal?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Terug van het zoeken naar producten: we zijn weer in het gewone bewerkscherm.
  useEffect(() => {
    nav.setPickFor(null);
  }, []);

  if (!meal) {
    return (
      <Screen>
        <BackHeader title="Maaltijd aanpassen" onBack={nav.back} />
        <T size={14} color={C.muted}>
          Deze maaltijd bestaat niet meer.
        </T>
      </Screen>
    );
  }

  const onName = (t: string) => {
    setName(t);
    if (t.trim()) actions.renameFavMeal(id, t);
  };

  const totals = sumNutrition(meal.items.map((i) => forGrams(i.food.per, i.grams)));
  const add = () => {
    nav.setPickFor(id);
    nav.push({ name: 'add', meal: mealForNow(), date: nav.day });
  };
  const remove = () => {
    actions.removeFavMeal(id);
    nav.back();
  };

  return (
    <Screen>
      <BackHeader title="Maaltijd aanpassen" onBack={nav.back} />

      <Card>
        <Field label="Naam" value={name} onChangeText={onName} keyboardType="default" invalid={!name.trim()} placeholder="Bijv. Standaard ontbijt" />
      </Card>

      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T size={14} weight="semibold" color={C.muted}>
            {meal.items.length === 1 ? '1 product' : `${meal.items.length} producten`}
          </T>
          <T size={20} weight="bold">
            {nl(totals.kcal)} kcal
          </T>
        </Row>
        {meal.items.length ? (
          <>
            {meal.items.map((it, i) => (
              <ItemRow
                key={`${i}-${it.food.id}`}
                item={it}
                onGrams={(g) => actions.updateFavMealItem(id, i, g)}
                onRemove={() => actions.removeFavMealItem(id, i)}
              />
            ))}
            <Row style={{ gap: 8 }}>
              <MacroTile label="Eiwit" value={`${nl(totals.e, 1)} g`} color={C.protein} />
              <MacroTile label="Koolh." value={`${nl(totals.k, 1)} g`} color={C.carbs} />
              <MacroTile label="Vet" value={`${nl(totals.v, 1)} g`} color={C.fat} />
              <MacroTile label="Vezels" value={`${nl(totals.fiber ?? 0, 1)} g`} color={C.fiber} />
            </Row>
          </>
        ) : (
          <T size={14} color={C.muted}>
            Nog geen producten. Voeg er een toe om te beginnen.
          </T>
        )}
      </Card>

      <Button label="Product toevoegen" icon="plus" variant="outline" onPress={add} />

      {confirmDelete ? (
        <Card style={{ gap: 10 }}>
          <T size={14} weight="semibold">
            Maaltijd "{meal.name}" verwijderen?
          </T>
          <Row style={{ gap: 8 }}>
            <Button small variant="ghost" label="Annuleren" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button small variant="danger" label="Verwijderen" onPress={remove} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button variant="danger" label="Maaltijd verwijderen" onPress={() => setConfirmDelete(true)} />
      )}
    </Screen>
  );
}

function ItemRow({ item, onGrams, onRemove }: { item: FavMealItem; onGrams: (g: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(String(Math.round(item.grams)));
  const u = unitOf(item.food);
  const n = parseNumber(text);
  const ok = n != null && n > 0 && n <= 5000;
  const kcal = ok ? (item.food.per.kcal * n!) / 100 : (item.food.per.kcal * item.grams) / 100;

  const onChange = (t: string) => {
    setText(t);
    const v = parseNumber(t);
    if (v != null && v > 0 && v <= 5000) onGrams(v);
  };

  return (
    <Row style={{ gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} weight="semibold" numberOfLines={2}>
          {item.food.name}
        </T>
        <T size={13} color={C.muted} numberOfLines={1}>
          {item.food.brand ? `${item.food.brand} · ` : ''}
          {nl(kcal)} kcal
        </T>
      </View>
      <View style={{ width: 96 }}>
        <TextInput
          accessibilityLabel={`Hoeveelheid ${item.food.name} in ${u === 'ml' ? 'milliliter' : 'gram'}`}
          value={text}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={{
            height: 44,
            borderWidth: 1.5,
            borderColor: ok ? C.line : C.warn,
            borderRadius: 12,
            backgroundColor: C.card,
            paddingLeft: 10,
            paddingRight: 30,
            fontFamily: F.semibold,
            fontSize: 16,
            color: C.ink,
            textAlign: 'right',
          }}
        />
        <T size={13} color={C.muted} style={{ position: 'absolute', right: 10, top: 13 }}>
          {u}
        </T>
      </View>
      <IconButton icon="close" label={`${item.food.name} uit de maaltijd halen`} onPress={onRemove} iconSize={18} />
    </Row>
  );
}
