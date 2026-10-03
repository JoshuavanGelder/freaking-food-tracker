import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ACTIVITY_LEVELS, Sex, parseNumber } from '../logic/calc';
import { useApp } from '../store';
import { useNav } from '../nav';
import { cloudConfigured } from '../cloud';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Field, H1, Screen, Segmented, T } from '../ui';

/** Profiel invullen: bij de eerste start (onboarding) en later via Doelen → Wijzigen. */
export function ProfileScreen({ onboarding }: { onboarding?: boolean }) {
  const { state, actions } = useApp();
  const nav = useNav();
  const p = state.profile;

  const [sex, setSex] = useState<Sex>(p?.sex ?? 'man');
  const [age, setAge] = useState(p ? String(p.age) : '');
  const [height, setHeight] = useState(p ? String(p.heightCm) : '');
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState(state.goals.targetWeight ? String(state.goals.targetWeight).replace('.', ',') : '');
  const [activity, setActivity] = useState(p?.activity ?? 1.375);
  const [tried, setTried] = useState(false);

  const nAge = parseNumber(age);
  const nHeight = parseNumber(height);
  const nWeight = parseNumber(weight);
  const nTarget = parseNumber(target);
  const okAge = nAge != null && nAge >= 14 && nAge <= 100;
  const okHeight = nHeight != null && nHeight >= 120 && nHeight <= 230;
  const okWeight = !onboarding || (nWeight != null && nWeight >= 30 && nWeight <= 300);
  const okTarget = nTarget != null && nTarget >= 30 && nTarget <= 300;
  const valid = okAge && okHeight && okWeight && okTarget;

  const save = () => {
    setTried(true);
    if (!valid) return;
    actions.setProfile(
      { sex, age: Math.round(nAge!), heightCm: Math.round(nHeight!), activity },
      Math.round(nTarget! * 10) / 10,
      onboarding ? Math.round(nWeight! * 10) / 10 : undefined,
    );
    if (!onboarding) nav.back();
  };

  return (
    <Screen>
      {onboarding ? (
        <View style={{ gap: 6, marginTop: 8 }}>
          <T size={13} weight="semibold" color={C.accent}>
            WELKOM BIJ
          </T>
          <H1>Freaking Food Tracker</H1>
          <T color={C.muted} style={{ lineHeight: 21 }}>
            Vul je gegevens in. Daarmee berekenen we je dagelijkse verbruik en je kcal-doel. Alles blijft op je telefoon.
          </T>
          {cloudConfigured ? (
            <Button small label="Inloggen met je account" onPress={() => nav.push({ name: 'cloud' })} style={{ marginTop: 6 }} />
          ) : null}
          <Button
            small
            variant="outline"
            label="Ik heb een reservekopie"
            onPress={() => nav.push({ name: 'import' })}
            style={{ marginTop: cloudConfigured ? 0 : 6 }}
          />
        </View>
      ) : (
        <BackHeader title="Profiel" onBack={nav.back} />
      )}

      <Card>
        <T size={13} weight="semibold" color={C.muted}>
          Geslacht
        </T>
        <Segmented
          options={[
            { value: 'man', label: 'Man' },
            { value: 'vrouw', label: 'Vrouw' },
          ]}
          value={sex}
          onChange={setSex}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field
            label="Leeftijd"
            value={age}
            onChangeText={setAge}
            unit="jaar"
            keyboardType="number-pad"
            invalid={tried && !okAge}
            style={{ flex: 1 }}
          />
          <Field
            label="Lengte"
            value={height}
            onChangeText={setHeight}
            unit="cm"
            keyboardType="number-pad"
            invalid={tried && !okHeight}
            style={{ flex: 1 }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {onboarding ? (
            <Field
              label="Gewicht nu"
              value={weight}
              onChangeText={setWeight}
              unit="kg"
              invalid={tried && !okWeight}
              style={{ flex: 1 }}
            />
          ) : null}
          <Field
            label="Doelgewicht"
            value={target}
            onChangeText={setTarget}
            unit="kg"
            invalid={tried && !okTarget}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <T size={13} weight="semibold" color={C.muted}>
          Hoe actief ben je?
        </T>
        <T size={12} color={C.muted}>
          Verbrande kcal van je telefoon of horloge tellen we niet mee; dit is de enige factor voor beweging.
        </T>
        {ACTIVITY_LEVELS.map((a) => {
          const on = Math.abs(a.factor - activity) < 0.001;
          return (
            <Pressable
              key={a.factor}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setActivity(a.factor)}
              style={{
                minHeight: 52,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: on ? C.accent : C.line,
                backgroundColor: on ? C.accentTint : C.card,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <T size={15} weight="semibold" color={on ? C.accent : C.ink}>
                  {a.label}
                </T>
                <T size={12} color={C.muted}>
                  {a.hint}
                </T>
              </View>
              <T size={13} weight="semibold" color={C.muted}>
                × {String(a.factor).replace('.', ',')}
              </T>
            </Pressable>
          );
        })}
      </Card>

      {tried && !valid ? (
        <T size={13} weight="semibold" color={C.warn}>
          Controleer de oranje velden: leeftijd 14–100, lengte 120–230 cm, gewicht 30–300 kg.
        </T>
      ) : null}
      <Button label={onboarding ? 'Starten' : 'Opslaan'} onPress={save} />
      {onboarding ? (
        <T size={12} color={C.muted} style={{ textAlign: 'center', fontFamily: F.regular }}>
          Je kunt dit later altijd aanpassen bij Doelen.
        </T>
      ) : null}
    </Screen>
  );
}
