import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share as RNShare, View } from 'react-native';
import {
  Friend,
  SHARE_KEYS,
  Share,
  addFriend,
  cloudConfigured,
  friendDays,
  friendWeights,
  listFriends,
  myFriendSettings,
  setName,
  setShare,
  shares,
  syncNow,
  useCloudStatus,
} from '../cloud';
import { addDays, dateKey, nl } from '../logic/calc';
import { FriendSummary, cleanCode, formatCode, summarizeFriend } from '../logic/friends';
import { useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { Bar, Button, Card, Chip, Empty, Field, H1, Row, Screen, T } from '../ui';

export const SHARE_LABELS: Record<keyof Share, { label: string; text: string }> = {
  totals: { label: 'Dagtotalen', text: 'kcal en macro’s per dag' },
  log: { label: 'Eetdagboek', text: 'wat je precies eet' },
  weight: { label: 'Gewicht', text: 'je gewichten en het verloop' },
  goals: { label: 'Doelen', text: 'je dagdoel, zodat ze je % zien' },
  favorites: { label: 'Favorieten', text: 'je favoriete producten en maaltijden, om over te nemen' },
};

type Row_ = { friend: Friend; summary: FriendSummary | null };

export function FriendsScreen() {
  const nav = useNav();
  const st = useCloudStatus();
  const { actions } = useApp();
  const bridge = { apply: actions.syncApply, read: actions.readState };

  const [rows, setRows] = useState<Row_[] | null>(null);
  const [settings, setSettings] = useState<{ code: string; share: Share } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [nameText, setNameText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = dateKey(new Date());
      const [mine, friends] = await Promise.all([myFriendSettings(), listFriends()]);
      setSettings(mine);
      const withData = await Promise.all(
        friends.map(async (f): Promise<Row_> => {
          const [days, weights] = await Promise.all([
            shares(f, 'totals') || shares(f, 'log') ? friendDays(f.id, addDays(today, -13), today) : Promise.resolve([]),
            shares(f, 'weight') ? friendWeights(f.id, addDays(today, -30)) : Promise.resolve([]),
          ]);
          return { friend: f, summary: summarizeFriend(days, weights, f.target?.kcal ?? null, today) };
        }),
      );
      setRows(withData);
    } catch (e: any) {
      setError(e?.message ?? 'Laden lukte niet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (st.email) load();
  }, [st.email, load]);

  if (!cloudConfigured || !st.email) {
    return (
      <Screen withTabBar>
        <H1>Vrienden</H1>
        <Empty
          title="Log eerst in"
          text="Om vrienden toe te voegen en elkaars voortgang te zien heb je een account nodig. Je gegevens blijven ook op je telefoon."
        >
          {cloudConfigured ? <Button small label="Account en cloud" onPress={() => nav.push({ name: 'cloud' })} /> : null}
        </Empty>
      </Screen>
    );
  }

  const add = async () => {
    const c = cleanCode(code);
    if (!c) {
      setAddMsg({ text: 'Een vriendcode bestaat uit 8 tekens, bijvoorbeeld a1b2 c3d4.', bad: true });
      return;
    }
    setAdding(true);
    setAddMsg(null);
    try {
      const f = await addFriend(c);
      setCode('');
      setAddMsg({ text: `${f.name || 'Je vriend'} is toegevoegd.` });
      await load();
    } catch (e: any) {
      setAddMsg({ text: e?.message ?? 'Toevoegen lukte niet.', bad: true });
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (k: keyof Share) => {
    if (!settings) return;
    const next = { ...settings.share, [k]: !settings.share[k] };
    setSettings({ ...settings, share: next });
    try {
      await setShare(next);
    } catch (e: any) {
      setSettings(settings);
      setError(e?.message ?? 'Opslaan lukte niet.');
    }
  };

  const shareCode = () => {
    if (!settings) return;
    RNShare.share({
      message: `Doe mee met de Freaking Food Tracker! Voeg me toe bij Vrienden met mijn code: ${formatCode(settings.code)}`,
    }).catch(() => {});
  };

  return (
    <Screen withTabBar>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <H1>Vrienden</H1>
        {loading ? <ActivityIndicator color={C.accent} /> : <Button small variant="ghost" label="Vernieuwen" onPress={load} />}
      </Row>

      {error ? (
        <Card style={{ gap: 8 }}>
          <T size={14} color={C.warn}>
            {error}
          </T>
          <Button
            small
            variant="outline"
            label="Synchroniseren en opnieuw proberen"
            onPress={async () => {
              await syncNow(bridge);
              load();
            }}
          />
        </Card>
      ) : null}

      {!st.name ? (
        <Card style={{ gap: 8 }}>
          <T size={15} weight="semibold">
            Hoe heet je?
          </T>
          <T size={13} color={C.muted}>
            Deze naam zien je vrienden.
          </T>
          <Field label="Naam" hideLabel value={nameText} onChangeText={setNameText} keyboardType="default" placeholder="Bijv. Joshua" />
          <Button
            small
            label="Opslaan"
            disabled={!nameText.trim()}
            onPress={async () => {
              await setName(nameText);
              await syncNow(bridge);
              load();
            }}
          />
        </Card>
      ) : null}

      {rows === null && loading ? null : rows && rows.length === 0 ? (
        <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
          Je hebt nog geen vrienden toegevoegd. Deel je code, of vul hieronder de code van een vriend in.
        </T>
      ) : null}

      {rows?.map((r) => (
        <FriendCard key={r.friend.id} row={r} onPress={() => nav.push({ name: 'friend', friend: r.friend })} />
      ))}

      <Card style={{ gap: 10 }}>
        <T size={14} weight="semibold" color={C.muted}>
          Vriend toevoegen
        </T>
        <Field label="Code van je vriend" value={code} onChangeText={setCode} keyboardType="default" placeholder="a1b2 c3d4" onSubmitEditing={add} />
        <Button small label={adding ? 'Bezig…' : 'Toevoegen'} onPress={add} disabled={adding || !code.trim()} />
        {addMsg ? (
          <T size={13} weight="semibold" color={addMsg.bad ? C.warn : C.accent}>
            {addMsg.text}
          </T>
        ) : null}
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />
        <T size={13} color={C.muted}>
          Jouw code
        </T>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={24} weight="bold" style={{ letterSpacing: 2 }}>
            {settings ? formatCode(settings.code) : '…'}
          </T>
          <Button small variant="outline" label="Delen" onPress={shareCode} disabled={!settings} />
        </Row>
        <T size={12} color={C.muted}>
          Wie jouw code invult, wordt jullie allebei vriend. Je ziet dan elkaars voortgang.
        </T>
      </Card>

      {settings ? (
        <Card style={{ gap: 10 }}>
          <T size={14} weight="semibold" color={C.muted}>
            Wat je vrienden van jou zien
          </T>
          {SHARE_KEYS.map((k) => (
            <Row key={k} style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T size={15} weight="semibold">
                  {SHARE_LABELS[k].label}
                </T>
                <T size={12} color={C.muted}>
                  {SHARE_LABELS[k].text}
                </T>
              </View>
              <View style={{ width: 76 }}>
                <Chip label={settings.share[k] ? 'Aan' : 'Uit'} on={settings.share[k]} onPress={() => toggle(k)} wide />
              </View>
            </Row>
          ))}
          <T size={12} color={C.muted}>
            Je profiel (leeftijd, lengte) deel je nooit, en je overige producten ook niet.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}

function FriendCard({ row, onPress }: { row: Row_; onPress: () => void }) {
  const f = row.friend;
  const s = row.summary;
  const eats = shares(f, 'totals') || shares(f, 'log');
  const target = f.target?.kcal ?? null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={17} weight="bold">
            {f.name || 'Vriend'}
          </T>
          {eats && s && s.streak > 1 ? (
            <T size={13} weight="semibold" color={C.accent}>
              {s.streak} dagen op rij
            </T>
          ) : null}
        </Row>
        {!eats ? (
          <T size={14} color={C.muted}>
            Deelt geen eten.
          </T>
        ) : s?.today ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={14}>Vandaag</T>
              <T size={14} weight="semibold">
                {nl(s.today.kcal)}
                {target ? ` / ${nl(target)}` : ''} kcal
              </T>
            </Row>
            {s.todayPct != null ? <Bar pct={s.todayPct * 100} color={s.todayPct > 1.1 ? C.warn : C.accent} /> : null}
          </>
        ) : (
          <T size={14} color={C.muted}>
            Vandaag nog niets gelogd.
          </T>
        )}
        {eats && s?.weekAvg != null ? (
          <T size={13} color={C.muted}>
            Deze week gemiddeld {nl(s.weekAvg)} kcal ({s.loggedThisWeek} {s.loggedThisWeek === 1 ? 'dag' : 'dagen'} gelogd)
          </T>
        ) : null}
        {shares(f, 'weight') && s?.latestKg != null ? (
          <T size={13} color={C.muted}>
            Gewicht {nl(s.latestKg, 1)} kg
            {s.weekChangeKg != null ? ` (${s.weekChangeKg > 0 ? '+' : s.weekChangeKg < 0 ? '−' : '±'}${nl(Math.abs(s.weekChangeKg), 1)} kg in een week)` : ''}
          </T>
        ) : null}
      </Card>
    </Pressable>
  );
}
