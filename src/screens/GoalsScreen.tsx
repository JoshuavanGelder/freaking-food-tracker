import React, { useState } from 'react';
import { View } from 'react-native';
import { GoalMode, MACRO_PLANS, activityLabel, nl, parseNumber, splitTotal } from '../logic/calc';
import { useApp } from '../store';
import { useNav } from '../nav';
import { useGoal } from '../useGoal';
import { NEVO } from '../data/nevo';
import { ExportSection } from './ExportSection';
import { UpdateSection } from './UpdateCard';
import { cloudConfigured, useCloudStatus } from '../cloud';
import { C } from '../theme';
import { Button, Card, Chip, Field, H1, MacroTile, Row, Screen, Segmented, T } from '../ui';

export function GoalsScreen() {
  const cloud = useCloudStatus();
  const { state, actions } = useApp();
  const nav = useNav();
  const goal = useGoal();
  const g = state.goals;
  const p = state.profile;

  const [targetText, setTargetText] = useState(g.targetWeight ? nl(g.targetWeight, 1) : '');
  const [paceText, setPaceText] = useState(nl(g.paceKgPerWeek, 2).replace(/,?0+$/, '') || '0');
  const [kcalText, setKcalText] = useState(String(g.kcalPerDay));
  const [custom, setCustom] = useState({ e: String(g.custom.e), k: String(g.custom.k), v: String(g.custom.v) });
  const [fiberText, setFiberText] = useState(String(g.fiberGoal ?? 30));

  if (!p || !goal) return null;
  const r = goal.result;

  const onTarget = (t: string) => {
    setTargetText(t);
    const n = parseNumber(t);
    if (n != null && n >= 30 && n <= 300) actions.setGoals({ targetWeight: Math.round(n * 10) / 10 });
  };
  const onPace = (t: string) => {
    setPaceText(t);
    const n = parseNumber(t);
    if (n != null && n >= -1 && n <= 2) actions.setGoals({ paceKgPerWeek: n });
  };
  const onKcal = (t: string) => {
    setKcalText(t);
    const n = parseNumber(t);
    if (n != null && n >= 800 && n <= 6000) actions.setGoals({ kcalPerDay: Math.round(n) });
  };
  const onFiber = (t: string) => {
    setFiberText(t);
    const n = parseNumber(t);
    if (n != null && n >= 5 && n <= 100) actions.setGoals({ fiberGoal: Math.round(n) });
  };
  const onCustom = (key: 'e' | 'k' | 'v', t: string) => {
    const next = { ...custom, [key]: t };
    setCustom(next);
    const e = parseNumber(next.e) ?? 0;
    const k = parseNumber(next.k) ?? 0;
    const v = parseNumber(next.v) ?? 0;
    actions.setGoals({ custom: { e, k, v } });
  };

  const paceN = parseNumber(paceText);
  const kcalN = parseNumber(kcalText);
  const inputBad = g.mode === 'tempo' ? paceN == null || paceN < -1 || paceN > 2 : kcalN == null || kcalN < 800 || kcalN > 6000;
  const helper = inputBad
    ? g.mode === 'tempo'
      ? 'Vul een tempo in tussen −1 en 2 kg per week'
      : 'Vul een aantal kcal in tussen 800 en 6.000'
    : r.warnings[0] ??
      (g.mode === 'tempo'
        ? `Dagdoel: ${nl(r.goal)} kcal`
        : `Dat is ongeveer ${r.pace >= 0 ? '−' : '+'}${nl(Math.abs(r.pace), 2)} kg per week`);
  const warn = inputBad || r.warnings.length > 0;

  const total = splitTotal(g.custom);
  const customBad = g.planId === 'eigen' && Math.abs(total - 100) > 0.05;

  return (
    <Screen withTabBar gap={12}>
      <H1>Doelen &amp; plan</H1>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T size={14} weight="semibold" color={C.muted}>
              Profiel
            </T>
            <T size={15} weight="semibold">
              {p.sex === 'man' ? 'Man' : 'Vrouw'} · {p.age} jr · {p.heightCm} cm · {activityLabel(p.activity)}
            </T>
          </View>
          <Button small variant="ghost" label="Wijzigen" onPress={() => nav.push({ name: 'profile' })} />
        </Row>
        <Field label="Doelgewicht" value={targetText} onChangeText={onTarget} unit="kg" invalid={parseNumber(targetText) == null} />
      </Card>

      <Card>
        <T size={14} weight="semibold" color={C.muted}>
          Kcal-doel instellen
        </T>
        <Segmented<GoalMode>
          options={[
            { value: 'tempo', label: 'Via tempo' },
            { value: 'kcal', label: 'Via kcal per dag' },
          ]}
          value={g.mode}
          onChange={(m) => actions.setGoals({ mode: m })}
        />
        {g.mode === 'tempo' ? (
          <Field label="Afvallen per week (negatief = aankomen)" value={paceText} onChangeText={onPace} unit="kg/wk" invalid={warn} />
        ) : (
          <Field label="Kcal per dag" value={kcalText} onChangeText={onKcal} unit="kcal" keyboardType="number-pad" invalid={warn} />
        )}
        <T size={13} weight="semibold" color={warn ? C.warn : C.muted}>
          {helper}
        </T>
      </Card>

      <Card style={{ gap: 8 }}>
        <T size={14} weight="semibold" color={C.muted}>
          Zo rekenen we
        </T>
        <Line label="Ruststofwisseling" value={`${nl(r.bmr)} kcal`} />
        <Line label={`Activiteit: ${activityLabel(p.activity).toLowerCase()}`} value={`× ${String(p.activity).replace('.', ',')}`} />
        <Line label="Dagelijks verbruik" value={`${nl(r.tdee)} kcal`} />
        <Line label={r.deficit >= 0 ? 'Tekort per dag' : 'Overschot per dag'} value={`${r.deficit >= 0 ? '−' : '+'}${nl(Math.abs(r.deficit))} kcal`} />
        <View style={{ height: 1, backgroundColor: C.track, marginVertical: 2 }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={15} weight="bold">
            Dagdoel
          </T>
          <T size={20} weight="bold" color={C.accent}>
            {nl(r.goal)} kcal
          </T>
        </Row>
        <T size={12} color={C.muted}>
          Op basis van je laatste gewicht: {nl(goal.weight, 1)} kg.
        </T>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={14} weight="semibold" color={C.muted}>
            Macroplan
          </T>
          {g.planId === 'eigen' ? (
            <T size={13} weight="semibold" color={customBad ? C.warn : C.muted}>
              {customBad ? `Totaal ${nl(total, 1)}%, moet 100% zijn` : 'Totaal 100%'}
            </T>
          ) : null}
        </Row>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {MACRO_PLANS.map((m) => (
            <Chip key={m.id} label={m.label} on={g.planId === m.id} onPress={() => actions.setGoals({ planId: m.id })} />
          ))}
        </Row>
        {g.planId === 'eigen' ? (
          <Row style={{ gap: 8 }}>
            <Field label="Eiwit" value={custom.e} onChangeText={(t) => onCustom('e', t)} unit="%" invalid={customBad} style={{ flex: 1 }} keyboardType="number-pad" />
            <Field label="Koolh." value={custom.k} onChangeText={(t) => onCustom('k', t)} unit="%" invalid={customBad} style={{ flex: 1 }} keyboardType="number-pad" />
            <Field label="Vet" value={custom.v} onChangeText={(t) => onCustom('v', t)} unit="%" invalid={customBad} style={{ flex: 1 }} keyboardType="number-pad" />
          </Row>
        ) : null}
        <Row style={{ gap: 8 }}>
          <MacroTile label={`Eiwit · ${nl(goal.split.e)}%`} value={`${goal.grams.e} g`} color={C.protein} />
          <MacroTile label={`Koolh. · ${nl(goal.split.k)}%`} value={`${goal.grams.k} g`} color={C.carbs} />
          <MacroTile label={`Vet · ${nl(goal.split.v)}%`} value={`${goal.grams.v} g`} color={C.fat} />
        </Row>
      </Card>

      <Card>
        <T size={14} weight="semibold" color={C.muted}>
          Vezels
        </T>
        <Field label="Vezeldoel per dag" value={fiberText} onChangeText={onFiber} unit="g" keyboardType="number-pad" invalid={!(parseNumber(fiberText) != null && parseNumber(fiberText)! >= 5 && parseNumber(fiberText)! <= 100)} />
        <T size={12} color={C.muted}>
          De Gezondheidsraad adviseert volwassenen 30 à 40 gram vezels per dag.
        </T>
      </Card>

      <Card>
        <T size={14} weight="semibold" color={C.muted}>
          Gegevens
        </T>
        <T size={13} color={C.muted}>
          Een reservekopie terugzetten, of eten overzetten met een importtekst van Claude.
        </T>
        <Button small variant="outline" label="Importeren of terugzetten" onPress={() => nav.push({ name: 'import' })} />
        {cloudConfigured ? (
          <>
            <Button small variant="outline" label="Account en cloud" onPress={() => nav.push({ name: 'cloud' })} />
            <T size={12} color={cloud.error ? C.warn : C.muted}>
              {cloud.email ? (cloud.error ? cloud.error : `Ingelogd als ${cloud.email}. Je gegevens worden bewaard in de cloud.`) : 'Niet ingelogd: je gegevens staan alleen op deze telefoon.'}
            </T>
          </>
        ) : null}
        <ExportSection />
      </Card>

      <Card>
        <T size={14} weight="semibold" color={C.muted}>
          App-versie
        </T>
        <UpdateSection />
      </Card>

      <T size={11} color={C.muted} style={{ lineHeight: 16, paddingHorizontal: 4 }}>
        Voedingswaarden van basisproducten zijn gebaseerd op gegevens van {NEVO.source}. Merkproducten komen uit Open
        Food Facts (openfoodfacts.org, ODbL); eigen producten voer je zelf in.
      </T>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T size={14}>{label}</T>
      <T size={14} weight="semibold">
        {value}
      </T>
    </Row>
  );
}
