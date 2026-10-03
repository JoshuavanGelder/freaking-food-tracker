import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { cloudConfigured, setName, signInWithGoogle, signOut, syncNow, useCloudStatus } from '../cloud';
import { useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Button, Card, Field, Row, Screen, T } from '../ui';

function since(iso: string | null): string {
  if (!iso) return 'nog niet';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'zojuist';
  if (mins < 60) return `${mins} min geleden`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date().toDateString() === d.toDateString();
  return today ? `vandaag om ${time}` : `${d.getDate()}-${d.getMonth() + 1} om ${time}`;
}

/** Account en cloud: inloggen met Google, status van de sync, naam voor vrienden, uitloggen. */
export function CloudScreen() {
  const { actions } = useApp();
  const nav = useNav();
  const st = useCloudStatus();
  const bridge = { apply: actions.syncApply, read: actions.readState };

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [name, setNameText] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Er ging iets mis.', bad: true });
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      const ok = await signInWithGoogle();
      if (ok) await syncNow(bridge);
    });

  if (!cloudConfigured) {
    return (
      <Screen>
        <BackHeader title="Account en cloud" onBack={nav.back} />
        <Card>
          <T size={15} weight="semibold">
            De cloud is nog niet ingesteld
          </T>
          <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
            Deze versie van de app heeft nog geen verbinding met de database. Je gegevens staan veilig op je telefoon.
          </T>
        </Card>
      </Screen>
    );
  }

  if (!st.email) {
    return (
      <Screen>
        <BackHeader title="Account en cloud" onBack={nav.back} />
        <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
          Met een account worden je gegevens bewaard in de cloud. Zo ben je niets kwijt bij een nieuwe telefoon, en kun je
          straks je voortgang delen met vrienden. Alles blijft ook op je telefoon staan en de app werkt gewoon zonder
          internet.
        </T>
        <Card style={{ gap: 12 }}>
          <Button label={busy ? 'Bezig…' : 'Inloggen met Google'} onPress={google} disabled={busy} />
          <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
            Er opent een Google-venster om je account te kiezen. Heb je nog geen account bij de app, dan wordt het
            aangemaakt. De app ziet alleen je naam en e-mailadres.
          </T>
          {msg ? (
            <T size={13} weight="semibold" color={msg.bad ? C.warn : C.muted}>
              {msg.text}
            </T>
          ) : null}
        </Card>
      </Screen>
    );
  }

  const nameValue = name ?? st.name;

  return (
    <Screen>
      <BackHeader title="Account en cloud" onBack={nav.back} />
      <Card style={{ gap: 6 }}>
        <T size={13} weight="semibold" color={C.muted}>
          Ingelogd als
        </T>
        <T size={16} weight="bold">
          {st.email}
        </T>
        <Row style={{ gap: 8, alignItems: 'center' }}>
          {st.syncing ? <ActivityIndicator color={C.accent} size="small" /> : null}
          <T size={14} color={st.error ? C.warn : C.muted} style={{ flex: 1 }}>
            {st.syncing ? 'Bezig met synchroniseren…' : st.error ? st.error : `Gesynchroniseerd: ${since(st.lastSync)}`}
          </T>
        </Row>
        <Button small variant="outline" label="Nu synchroniseren" onPress={() => syncNow(bridge)} disabled={st.syncing} />
        <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
          De app synchroniseert vanzelf als je hem opent of sluit, en kort nadat je iets wijzigt. Zonder internet wacht hij
          tot er weer verbinding is.
        </T>
      </Card>

      <Card style={{ gap: 8 }}>
        <Field
          label="Naam voor vrienden"
          value={nameValue}
          onChangeText={setNameText}
          keyboardType="default"
          placeholder="Bijv. Joshua"
        />
        <Button
          small
          label="Naam opslaan"
          disabled={name == null || name.trim() === st.name}
          onPress={async () => {
            await setName(name ?? '');
            setNameText(null);
            syncNow(bridge);
          }}
        />
        <T size={12} color={C.muted}>
          Deze naam zien je vrienden straks als ze je toevoegen.
        </T>
      </Card>

      <View style={{ gap: 8 }}>
        {confirmOut ? (
          <Card style={{ gap: 8 }}>
            <T size={14} style={{ lineHeight: 20 }}>
              Uitloggen? Je gegevens blijven op deze telefoon staan, maar worden niet meer bewaard in de cloud tot je weer
              inlogt.
            </T>
            <Row style={{ gap: 8 }}>
              <Button small variant="danger" label="Uitloggen" onPress={() => run(signOut)} style={{ flex: 1 }} />
              <Button small variant="outline" label="Annuleren" onPress={() => setConfirmOut(false)} style={{ flex: 1 }} />
            </Row>
          </Card>
        ) : (
          <Button small variant="ghost" label="Uitloggen" onPress={() => setConfirmOut(true)} />
        )}
      </View>
    </Screen>
  );
}
