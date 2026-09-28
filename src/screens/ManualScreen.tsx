import React, { useState } from 'react';
import { View } from 'react-native';
import { nl, parseNumber } from '../logic/calc';
import type { Food, Unit } from '../logic/off';
import { MealId, uid, useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Button, Card, Field, Screen, Segmented, T } from '../ui';

function start(x: number | undefined, decimals = 1): string {
  return x == null ? '' : nl(x, decimals).replace(/,0$/, '');
}

/**
 * Eigen product invoeren vanaf het etiket (per 100 g of ml).
 * Met `base` pas je een bestaand product aan; bij een gescand product
 * bewaart de app jouw versie onder dezelfde barcode, zodat hij voortaan die gebruikt.
 */
export function ManualScreen({ meal, date, barcode, base }: { meal: MealId; date: string; barcode?: string; base?: Food }) {
  const { actions } = useApp();
  const nav = useNav();
  const code = barcode ?? base?.barcode;
  const [name, setName] = useState(base?.name ?? '');
  const [kcal, setKcal] = useState(start(base?.per.kcal, 0));
  const [e, setE] = useState(start(base?.per.e));
  const [k, setK] = useState(start(base?.per.k));
  const [v, setV] = useState(start(base?.per.v));
  const [fiber, setFiber] = useState(start(base?.per.fiber));
  const [serving, setServing] = useState(start(base?.servingG, 0));
  const [unit, setUnit] = useState<Unit>(base?.unit ?? 'g');
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
    const servingG = nServing && nServing > 0 ? nServing : undefined;
    const food: Food = {
      id: base?.source === 'eigen' ? base.id : 'eigen:' + (code ?? uid()),
      name: name.trim(),
      brand: base?.brand,
      per: { kcal: nKcal!, e: nE, k: nK, v: nV, fiber: parseNumber(fiber) ?? undefined },
      servingG,
      servingLabel: servingG && base?.servingG && Math.round(base.servingG) === Math.round(servingG) ? base.servingLabel : undefined,
      packageG: base?.packageG,
      unit,
      barcode: code,
      source: 'eigen',
    };
    actions.saveFood(food);
    nav.replace({ name: 'product', food, meal, date });
  };

  return (
    <Screen>
      <BackHeader title={base ? 'Waarden aanpassen' : 'Product maken'} onBack={nav.back} />
      {base?.source === 'off' ? (
        <T size={13} color={C.muted} style={{ lineHeight: 19 }}>
          Neem de waarden over van het etiket, kolom "per 100 g" (bij een mix: onbereid). Je aangepaste versie wordt bewaard
          {code ? ' onder deze barcode' : ''}; de app gebruikt voortaan die.
        </T>
      ) : code ? (
        <T size={13} color={C.muted}>
          Barcode {code} wordt gekoppeld, zodat de app dit product de volgende keer herkent.
        </T>
      ) : null}
      <Card>
        <Field label="Naam" value={name} onChangeText={setName} keyboardType="default" invalid={tried && !okName} placeholder="Bijv. Kwark van de markt" />
        <Segmented<Unit>
          options={[
            { value: 'g', label: 'Vast (gram)' },
            { value: 'ml', label: 'Drinken (ml)' },
          ]}
          value={unit}
          onChange={setUnit}
        />
        <T size={13} weight="semibold" color={C.muted}>
          Voedingswaarden per 100 {unit} (staat op het etiket)
        </T>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Energie" value={kcal} onChangeText={setKcal} unit="kcal" invalid={tried && !okKcal} style={{ flex: 1 }} />
          <Field label="Eiwit" value={e} onChangeText={setE} unit="g" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Koolhydraten" value={k} onChangeText={setK} unit="g" style={{ flex: 1 }} />
          <Field label="Vet" value={v} onChangeText={setV} unit="g" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Vezels" value={fiber} onChangeText={setFiber} unit="g" style={{ flex: 1 }} />
          <Field label="Portie (optioneel)" value={serving} onChangeText={setServing} unit={unit} style={{ flex: 1 }} />
        </View>
      </Card>
      {tried && !valid ? (
        <T size={13} weight="semibold" color={C.warn}>
          Vul een naam in en de energie per 100 {unit} (0–950 kcal).
        </T>
      ) : null}
      <Button label={base ? 'Opslaan' : 'Opslaan en portie kiezen'} onPress={save} />
    </Screen>
  );
}
