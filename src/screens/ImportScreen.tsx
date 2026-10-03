import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import { formatLong, nl } from '../logic/calc';
import { backupSummary, mergeBackup, parseBackup } from '../logic/backup';
import { parseImport, toEntries } from '../logic/importer';
import { MEALS, useApp } from '../store';
import { useNav } from '../nav';
import { C, F } from '../theme';
import { BackHeader, Button, Card, Empty, Row, Screen, Segmented, T } from '../ui';

export function ImportScreen() {
  const { state, actions } = useApp();
  const nav = useNav();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);
  // Profiel en doelen uit de reservekopie: standaard aan op een (bijna) lege telefoon.
  const [withProfile, setWithProfile] = useState<'ja' | 'nee'>(!state.profile || state.log.length === 0 ? 'ja' : 'nee');

  const backupParsed = useMemo(() => (text.trim() ? parseBackup(text) : null), [text]);
  const isExport = !!backupParsed && !('notExport' in backupParsed);
  const backup = backupParsed && backupParsed.ok ? backupParsed.backup : null;
  const backupError = backupParsed && !backupParsed.ok && 'error' in backupParsed ? backupParsed.error : null;
  const preview = useMemo(() => {
    if (!backup) return null;
    return { summary: backupSummary(backup.state), added: mergeBackup(state, backup.state, withProfile === 'ja').added };
  }, [backup, state, withProfile]);

  const parsed = useMemo(() => (text.trim() && !isExport ? parseImport(text) : null), [text, isExport]);
  const file = parsed && parsed.ok ? parsed.file : null;
  const entries = useMemo(() => (file ? toEntries(file) : []), [file]);
  const already = !!file && state.imports.includes(file.id);
  const dates = useMemo(() => [...new Set(entries.map((e) => e.date))].sort().reverse(), [entries]);

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) {
      setText(t);
      setFileName(null);
      setFileError(null);
    }
  };

  const pickFile = async () => {
    setFileError(null);
    try {
      const res = await File.pickFileAsync({ mimeTypes: '*/*' });
      if (res.canceled || !res.result) return;
      const content = await res.result.text();
      setText(content);
      setFileName(decodeURIComponent(res.result.uri.split('/').pop() ?? 'bestand'));
    } catch (e: any) {
      setFileError(`Het bestand openen lukte niet: ${e?.message ?? 'onbekende fout'}`);
    }
  };

  const restore = () => {
    if (!backup || !preview) return;
    const a = preview.added;
    actions.restoreBackup(backup.state, withProfile === 'ja');
    const parts = [
      `${a.days} ${a.days === 1 ? 'dag' : 'dagen'} (${a.entries} ${a.entries === 1 ? 'product' : 'producten'})`,
      `${a.weights} ${a.weights === 1 ? 'gewicht' : 'gewichten'}`,
      `${a.favMeals} favoriete ${a.favMeals === 1 ? 'maaltijd' : 'maaltijden'}`,
    ];
    setRestored(`Teruggezet: ${parts.join(', ')}.`);
  };

  const run = () => {
    if (!file || already) return;
    actions.importData(file.id, entries, file.favMeals ?? []);
    nav.setDay(file.date);
    setDone(true);
  };

  if (restored) {
    return (
      <Screen>
        <BackHeader title="Terugzetten" onBack={nav.home} />
        <Empty title="Gelukt" text={restored}>
          <Button small label="Naar je dag" onPress={nav.home} />
        </Empty>
      </Screen>
    );
  }

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
      <BackHeader title="Importeren of terugzetten" onBack={nav.back} />
      <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
        Kies een exportbestand van "Alles" om je gegevens terug te zetten, of plak een importtekst van Claude. Je ziet
        eerst wat er wordt toegevoegd.
      </T>
      <Row style={{ gap: 8 }}>
        <Button label="Bestand kiezen" onPress={pickFile} style={{ flex: 1 }} />
        <Button label="Plakken" onPress={paste} variant="outline" style={{ flex: 1 }} />
      </Row>
      {fileError ? (
        <T size={13} weight="semibold" color={C.warn}>
          {fileError}
        </T>
      ) : null}
      {fileName ? (
        <T size={13} color={C.muted}>
          Bestand: {fileName}
        </T>
      ) : null}
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
          borderColor: (parsed && !parsed.ok) || backupError ? C.warn : C.line,
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

      {backupError ? (
        <T size={13} weight="semibold" color={C.warn}>
          {backupError}
        </T>
      ) : null}

      {backup && preview ? (
        <>
          <Card style={{ gap: 8 }}>
            <T size={16} weight="bold">
              Reservekopie{backup.exportedAt ? ` van ${formatLong(backup.exportedAt.slice(0, 10))}` : ''}
            </T>
            <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
              {preview.summary.days} {preview.summary.days === 1 ? 'dag' : 'dagen'} eten
              {preview.summary.from && preview.summary.to
                ? ` (${formatLong(preview.summary.from)} t/m ${formatLong(preview.summary.to)})`
                : ''}
              , {preview.summary.weights} {preview.summary.weights === 1 ? 'gewicht' : 'gewichten'},{' '}
              {preview.summary.ownFoods} eigen {preview.summary.ownFoods === 1 ? 'product' : 'producten'},{' '}
              {preview.summary.favorites} favoriete {preview.summary.favorites === 1 ? 'product' : 'producten'} en{' '}
              {preview.summary.favMeals} favoriete {preview.summary.favMeals === 1 ? 'maaltijd' : 'maaltijden'}.
            </T>
            {backup.skipped > 0 ? (
              <T size={12} color={C.warn}>
                {backup.skipped} {backup.skipped === 1 ? 'onderdeel is' : 'onderdelen zijn'} beschadigd en wordt overgeslagen.
              </T>
            ) : null}
          </Card>

          {backup.state.profile && state.profile ? (
            <Card style={{ gap: 8 }}>
              <T size={14} weight="semibold">
                Profiel en doelen uit de reservekopie overnemen?
              </T>
              <Segmented
                options={[
                  { value: 'ja', label: 'Ja' },
                  { value: 'nee', label: 'Nee, huidige houden' },
                ]}
                value={withProfile}
                onChange={setWithProfile}
              />
            </Card>
          ) : null}

          <Card style={{ gap: 4 }}>
            <T size={14} weight="semibold">
              Wat erbij komt
            </T>
            <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
              {preview.added.days} {preview.added.days === 1 ? 'dag' : 'dagen'} ({preview.added.entries}{' '}
              {preview.added.entries === 1 ? 'product' : 'producten'}), {preview.added.weights}{' '}
              {preview.added.weights === 1 ? 'gewicht' : 'gewichten'}, {preview.added.foods} opgeslagen{' '}
              {preview.added.foods === 1 ? 'product' : 'producten'} en {preview.added.favMeals} favoriete{' '}
              {preview.added.favMeals === 1 ? 'maaltijd' : 'maaltijden'}.
            </T>
            <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
              Wat al in de app staat blijft staan en wordt niet overschreven. Dubbele dingen komen er niet nog een keer bij.
            </T>
          </Card>
          <Button
            label="Terugzetten"
            onPress={restore}
            disabled={
              preview.added.entries + preview.added.weights + preview.added.foods + preview.added.favMeals + preview.added.favorites === 0 &&
              !(withProfile === 'ja' && backup.state.profile && !state.profile)
            }
          />
          {preview.added.entries + preview.added.weights + preview.added.foods + preview.added.favMeals + preview.added.favorites === 0 ? (
            <T size={13} color={C.muted}>
              Alles uit deze reservekopie staat al in de app.
            </T>
          ) : null}
        </>
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
