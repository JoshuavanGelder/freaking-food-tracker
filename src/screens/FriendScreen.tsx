import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Friend, FriendDay, FriendEntry, friendDays, friendEntries, friendWeights, removeFriend, shares } from '../cloud';
import { addDays, dateKey, formatLong, formatShort, nl } from '../logic/calc';
import { MEALS } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Bar, Button, Card, IconButton, Row, Screen, T } from '../ui';

/** Eén vriend: dagtotalen per dag, wat hij at (als hij dat deelt) en zijn gewicht. */
export function FriendScreen({ friend }: { friend: Friend }) {
  const nav = useNav();
  const today = dateKey(new Date());
  const [day, setDay] = useState(today);
  const [total, setTotal] = useState<FriendDay | null>(null);
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [weights, setWeights] = useState<{ date: string; kg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const name = friend.name || 'Je vriend';
  const eats = shares(friend, 'totals') || shares(friend, 'log');
  const target = friend.target;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      eats ? friendDays(friend.id, day, day) : Promise.resolve([]),
      shares(friend, 'log') ? friendEntries(friend.id, day) : Promise.resolve([]),
    ])
      .then(([d, e]) => {
        if (!alive) return;
        setTotal(d[0] ?? null);
        setEntries(e);
      })
      .catch((e: any) => alive && setError(e?.message ?? 'Laden lukte niet.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [friend.id, day]);

  useEffect(() => {
    if (shares(friend, 'weight')) friendWeights(friend.id, addDays(today, -60)).then(setWeights).catch(() => {});
  }, [friend.id]);

  const title = day === today ? 'Vandaag' : day === addDays(today, -1) ? 'Gisteren' : formatShort(day);
  const macros = [
    { label: 'Eiwit', value: total?.e ?? 0, goal: target?.e, color: C.protein },
    { label: 'Koolh.', value: total?.k ?? 0, goal: target?.k, color: C.carbs },
    { label: 'Vet', value: total?.v ?? 0, goal: target?.v, color: C.fat },
    { label: 'Vezels', value: total?.fiber ?? 0, goal: target?.fiber, color: C.fiber },
  ];
  const recentWeights = [...weights].reverse().slice(0, 10);

  return (
    <Screen>
      <BackHeader title={name} onBack={nav.back} />

      {eats ? (
        <>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <IconButton icon="back" label="Vorige dag" onPress={() => setDay(addDays(day, -1))} color={C.ink} />
            <View style={{ alignItems: 'center' }}>
              <T size={17} weight="bold">
                {title}
              </T>
              <T size={12} color={C.muted}>
                {formatLong(day)}
              </T>
            </View>
            {day < today ? (
              <IconButton icon="forward" label="Volgende dag" onPress={() => setDay(addDays(day, 1))} color={C.ink} />
            ) : (
              <View style={{ width: 44 }} />
            )}
          </Row>

          <Card style={{ gap: 10 }}>
            {loading ? (
              <ActivityIndicator color={C.accent} />
            ) : !total ? (
              <T size={14} color={C.muted}>
                {name} heeft deze dag niets gelogd.
              </T>
            ) : (
              <>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T size={28} weight="bold">
                    {nl(total.kcal)} kcal
                  </T>
                  {target ? (
                    <T size={14} color={C.muted}>
                      van {nl(target.kcal)} ({nl((total.kcal / target.kcal) * 100)}%)
                    </T>
                  ) : null}
                </Row>
                {target ? <Bar pct={(total.kcal / target.kcal) * 100} color={total.kcal > target.kcal * 1.1 ? C.warn : C.accent} height={10} /> : null}
                {macros.map((m) => (
                  <View key={m.label} style={{ gap: 4 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T size={13}>{m.label}</T>
                      <T size={13} weight="semibold">
                        {nl(m.value)}
                        {m.goal ? ` / ${nl(m.goal)}` : ''} g
                      </T>
                    </Row>
                    {m.goal ? <Bar pct={(m.value / m.goal) * 100} color={m.color} height={6} /> : null}
                  </View>
                ))}
              </>
            )}
          </Card>

          {shares(friend, 'log') ? (
            total && entries.length ? (
              <Card style={{ gap: 10 }}>
                {MEALS.map((m) => {
                  const items = entries.filter((e) => e.meal === m.id);
                  if (!items.length) return null;
                  const kcal = items.reduce((s, e) => s + e.kcal, 0);
                  return (
                    <View key={m.id} style={{ gap: 4 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T size={15} weight="bold">
                          {m.label}
                        </T>
                        <T size={14} weight="semibold">
                          {nl(kcal)} kcal
                        </T>
                      </Row>
                      {items.map((e, i) => (
                        <Row key={i} style={{ justifyContent: 'space-between', gap: 8 }}>
                          <T size={13} color={C.muted} style={{ flex: 1 }}>
                            {e.name}
                            {e.brand ? ` (${e.brand})` : ''} · {nl(e.grams)} {e.unit}
                          </T>
                          <T size={13} color={C.muted}>
                            {nl(e.kcal)}
                          </T>
                        </Row>
                      ))}
                    </View>
                  );
                })}
              </Card>
            ) : null
          ) : (
            <T size={13} color={C.muted}>
              {name} deelt alleen dagtotalen, niet wat hij precies eet.
            </T>
          )}
        </>
      ) : (
        <Card>
          <T size={14} color={C.muted}>
            {name} deelt geen eten.
          </T>
        </Card>
      )}

      {error ? (
        <T size={13} color={C.warn}>
          {error}
        </T>
      ) : null}

      {shares(friend, 'weight') ? (
        <Card style={{ gap: 6 }}>
          <T size={14} weight="semibold" color={C.muted}>
            Gewicht
          </T>
          {recentWeights.length ? (
            recentWeights.map((w) => (
              <Row key={w.date} style={{ justifyContent: 'space-between' }}>
                <T size={14}>{formatShort(w.date)}</T>
                <T size={14} weight="semibold">
                  {nl(w.kg, 1)} kg
                </T>
              </Row>
            ))
          ) : (
            <T size={14} color={C.muted}>
              Nog geen gewichten in de afgelopen twee maanden.
            </T>
          )}
        </Card>
      ) : null}

      {confirm ? (
        <Card style={{ gap: 8 }}>
          <T size={14} style={{ lineHeight: 20 }}>
            {name} verwijderen als vriend? Jullie zien dan elkaars voortgang niet meer. Je kunt elkaar later weer toevoegen
            met de code.
          </T>
          <Row style={{ gap: 8 }}>
            <Button
              small
              variant="danger"
              label="Verwijderen"
              onPress={async () => {
                try {
                  await removeFriend(friend.id);
                  nav.back();
                } catch (e: any) {
                  setError(e?.message ?? 'Verwijderen lukte niet.');
                }
              }}
              style={{ flex: 1 }}
            />
            <Button small variant="outline" label="Annuleren" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button small variant="ghost" label="Vriend verwijderen" onPress={() => setConfirm(true)} />
      )}
    </Screen>
  );
}
