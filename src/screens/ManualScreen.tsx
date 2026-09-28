import React, { useState } from 'react';
import { View } from 'react-native';
import { parseNumber } from '../logic/calc';
import type { Food } from '../logic/off';
import { MealId, uid, useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Button, Card, Field, Screen, T } from '../ui';

/** Eigen product invoeren vanaf het etiket (per 100 g). */
export function ManualScreen({ meal, date, barcode }: { meal: MealId; date: string; barcode?: string }) {
  const { actions } = useApp();
  const nav = useNav();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [e, setE] = useState('');
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [serving, setServing] = useState('');
  const [tried, setTried] = useState(false);

  const nKcal = parseNumber(kcal);
  const nE = parseNumber(e) ?? 0;
  const nK = parseNumber(k) ?? 0;
  const nV = parseNumber(v) ?? 0;
  const nServing = parseNumber(serving);
  const okName = name.trim().length > 0;
  const okKcal = nKcal != null && nKcal >= 0 && nKcal <= 950;
  const valid = okName && okKcal;

  const save = () => {
    setTried(true);
    if (!valid) return;
    const food: Food = {
      id: 'eigen:' + (barcode ?? uid()),
      name: name.trim(),
      per: { kcal: nKcal!, e: nE, k: nK, v: nV },
      servingG: nServing && nServing > 0 ? nServing : undefined,
      source: 'eigen',
    };
    actions.saveFood(food);
    nav.replace({ name: 'product', food, meal, date });
  };

  return (
    <Screen>
      <BackHeader title="Product maken" onBack={nav.back} />
      {barcode ? (
        <T size={13} color={C.muted}>
          Barcode {barcode} wordt gekoppeld, zodat de app dit product de volgende keer herkent.
        </T>
      ) : null}
      <Card>
        <Field label="Naam" value={name} onChangeText={setName} keyboardType="default" invalid={tried && !okName} placeholder="Bijv. Kwark van de markt" />
        <T size={13} weight="semibold" color={C.muted}>
          Voedingswaarden per 100 g (staat op het etiket)
        </T>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Energie" value={kcal} onChangeText={setKcal} unit="kcal" invalid={tried && !okKcal} style={{ flex: 1 }} />
          <Field label="Eiwit" value={e} onChangeText={setE} unit="g" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Koolhydraten" value={k} onChangeText={setK} unit="g" style={{ flex: 1 }} />
          <Field label="Vet" value={v} onChangeText={setV} unit="g" style={{ flex: 1 }} />
        </View>
        <Field label="Gebruikelijke portie (optioneel)" value={serving} onChangeText={setServing} unit="g" />
      </Card>
      {tried && !valid ? (
        <T size={13} weight="semibold" color={C.warn}>
          Vul een naam in en de energie per 100 g (0–950 kcal).
        </T>
      ) : null}
      <Button label="Opslaan en portie kiezen" onPress={save} />
    </Screen>
  );
}
