import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatLong, nl } from '../logic/calc';
import { parseImport, toEntries } from '../logic/importer';
import { MEALS, useApp } from '../store';
import { useNav } from '../nav';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Empty, Row, Screen, T } from '../ui';

export function ImportScreen() {
  const { state, actions } = useApp();
  const nav = useNav();
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text]);
  const file = parsed && parsed.ok ? parsed.file : null;
  const entries = useMemo(() => (file ? toEntries(file) : []), [file]);
  const already = !!file && state.imports.includes(file.id);
  const dates = useMemo(() => [...new Set(entries.map((e) => e.date))].sort().reverse(), [entries]);

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) setText(t);
  };

  const run = () => {
    if (!file || already) return;
    actions.importData(file.id, entries, file.favMeals ?? []);
    nav.setDay(file.date);
    setDone(true);
  };

  if (done && file) {
    return (
      <Screen>
        <BackHeader title="Importeren" onBack={nav.back} />
        <Empty title="Gelukt" text={`Je logboek is aangevuld voor ${dates.length} ${dates.length === 1 ? 'dag' : 'dagen'}.`}>
          <Button small label="Bekijk je dag" onPress={nav.home} />
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title="Importeren" onBack={nav.back} />
      <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
        Kopieer de importtekst uit de chat met Claude en plak hem hieronder. Je ziet eerst wat er wordt toegevoegd.
      </T>
      <Button label="Plakken uit klembord" onPress={paste} variant="outline" />
      <TextInput
        accessibilityLabel="Importtekst"
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Of plak hier zelf de tekst…"
        placeholderTextColor="#9A9D96"
        style={{
          minHeight: 110,
          maxHeight: 180,
          borderWidth: 1.5,
          borderColor: parsed && !parsed.ok ? C.warn : C.line,
          borderRadius: 12,
          backgroundColor: C.card,
          padding: 12,
          fontFamily: F.regular,
          fontSize: 12,
          color: C.ink,
          textAlignVertical: 'top',
        }}
      />

      {parsed && !parsed.ok ? (
        <T size={13} weight="semibold" color={C.warn}>
          {parsed.error}
        </T>
      ) : null}

      {file ? (
        <>
          {dates.map((d) => (
            <Card key={d} style={{ gap: 10 }}>
              <T size={16} weight="bold">
                {formatLong(d)}
              </T>
              {MEALS.map((m) => {
                const items = entries.filter((e) => e.date === d && e.meal === m.id);
                if (!items.length) return null;
                const kcal = items.reduce((s, e) => s + (e.food.per.kcal * e.grams) / 100, 0);
                const onlySummary = items.every((e) => e.summary);
                return (
                  <View key={m.id} style={{ gap: 2 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T size={15} weight="semibold">
                        {onlySummary ? 'Dagtotaal' : m.label}
                      </T>
                      <T size={15} weight="bold">
                        {nl(kcal)} kcal
                      </T>
                    </Row>
                    {!onlySummary ? (
                      <T size={13} color={C.muted}>
                        {items.map((e) => e.food.name).join(', ')}
                      </T>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ))}
          {file.source ? (
            <T size={12} color={C.muted}>
              Bron: {file.source}
            </T>
          ) : null}
          {file.favMeals?.length ? (
            <T size={12} color={C.muted}>
              Wordt ook opgeslagen als favoriete maaltijd: {file.favMeals.map((f) => f.name).join(', ')}
            </T>
          ) : null}
          {already ? (
            <T size={13} weight="semibold" color={C.warn}>
              Deze tekst heb je al geïmporteerd. Hij wordt niet nog een keer toegevoegd.
            </T>
          ) : null}
          <Button label={`Toevoegen aan ${dates.length} ${dates.length === 1 ? 'dag' : 'dagen'}`} onPress={run} disabled={already} />
        </>
      ) : null}
    </Screen>
  );
}
