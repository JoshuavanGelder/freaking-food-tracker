import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatShort, nl } from '../logic/calc';
import { kcalOf, offerFor, weekdayName, weekdayOf } from '../logic/dayplan';
import { MEALS, useApp } from '../store';
import { C } from '../theme';
import { Button, Card, H2, Row, T } from '../ui';

/**
 * Voorstel voor één dag: jouw standaard voor deze weekdag, of (als je die niet hebt) dezelfde dag van vorige week.
 * Er wordt niets toegevoegd voordat je op "Overnemen" tikt; "Overslaan" laat de dag leeg en het voorstel verdwijnt.
 */
export function DayOffer({ day }: { day: string }) {
  const { state, actions } = useApp();
  const offer = offerFor(day, state.log, state.weekdayDefaults, state.defaultsDone);
  if (!offer) return null;

  const wd = weekdayName(day);
  const title = offer.source === 'default' ? `Jouw standaard voor ${wd}` : `Zoals vorige ${wd}`;
  const sub =
    offer.source === 'default'
      ? 'Er wordt niets toegevoegd tot je op Overnemen tikt.'
      : `Je hebt geen standaard voor ${wd}. Dit is ${wd} ${offer.from ? formatShort(offer.from) : 'van vorige week'}. Er wordt niets toegevoegd tot je op Overnemen tikt.`;

  return (
    <Card style={{ gap: 10, borderWidth: 1.5, borderColor: C.accent }}>
      <View style={{ gap: 2 }}>
        <T size={15} weight="bold">
          {title}
        </T>
        <T size={13} color={C.muted} style={{ lineHeight: 19 }}>
          {sub}
        </T>
      </View>
      <View style={{ gap: 4 }}>
        {MEALS.map((m) => {
          const items = offer.items.filter((i) => i.meal === m.id);
          if (!items.length) return null;
          return (
            <Row key={m.id} style={{ alignItems: 'flex-start', gap: 8 }}>
              <T size={13} weight="semibold" style={{ width: 64 }}>
                {m.label}
              </T>
              <T size={13} color={C.muted} style={{ flex: 1 }} numberOfLines={2}>
                {items.map((i) => i.food.name).join(', ')}
              </T>
              <T size={13} color={C.muted}>
                {nl(kcalOf(items))} kcal
              </T>
            </Row>
          );
        })}
      </View>
      <Row style={{ gap: 8 }}>
        <Button small label={`Overnemen · ${nl(kcalOf(offer.items))} kcal`} onPress={() => actions.acceptDayOffer(day, offer.items)} style={{ flex: 1 }} />
        <Button small variant="ghost" label="Overslaan" onPress={() => actions.skipDayOffer(day)} />
      </Row>
    </Card>
  );
}

/** Standaard voor deze weekdag instellen (van wat er nu op deze dag staat) of wissen. */
export function DayDefaultCard({ day, hasEntries }: { day: string; hasEntries: boolean }) {
  const { state, actions } = useApp();
  const [confirm, setConfirm] = useState<'replace' | 'clear' | null>(null);
  useEffect(() => setConfirm(null), [day]);

  const wd = weekdayName(day);
  const current = state.weekdayDefaults[String(weekdayOf(day))];
  const has = !!current && current.length > 0;

  return (
    <Card style={{ gap: 10 }}>
      <H2>Standaard {wd}</H2>
      <T size={13} color={C.muted} style={{ lineHeight: 19 }}>
        {has
          ? `Ingesteld: ${nl(kcalOf(current))} kcal, ${current.length} ${current.length === 1 ? 'product' : 'producten'}. Op elke ${wd} krijg je dit voorgesteld; jij kiest per dag of je het overneemt.`
          : `Niet ingesteld. Zonder standaard stel ik de ${wd} van vorige week voor (als die gelogd is).`}
      </T>

      {confirm === 'replace' ? (
        <View style={{ gap: 8 }}>
          <T size={13} weight="semibold">
            De huidige standaard van {wd} vervangen door deze dag?
          </T>
          <Row style={{ gap: 8 }}>
            <Button
              small
              label="Vervangen"
              onPress={() => {
                actions.setWeekdayDefault(day);
                setConfirm(null);
              }}
              style={{ flex: 1 }}
            />
            <Button small variant="ghost" label="Annuleren" onPress={() => setConfirm(null)} />
          </Row>
        </View>
      ) : confirm === 'clear' ? (
        <View style={{ gap: 8 }}>
          <T size={13} weight="semibold">
            De standaard van {wd} wissen?
          </T>
          <Row style={{ gap: 8 }}>
            <Button
              small
              variant="danger"
              label="Wissen"
              onPress={() => {
                actions.clearWeekdayDefault(weekdayOf(day));
                setConfirm(null);
              }}
              style={{ flex: 1 }}
            />
            <Button small variant="ghost" label="Annuleren" onPress={() => setConfirm(null)} />
          </Row>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Button
            small
            variant="outline"
            label={has ? 'Vervang door deze dag' : 'Bewaar deze dag als standaard'}
            disabled={!hasEntries}
            onPress={() => (has ? setConfirm('replace') : actions.setWeekdayDefault(day))}
          />
          {!hasEntries ? (
            <T size={12} color={C.muted}>
              Vul deze dag eerst; daarna kun je hem als standaard bewaren.
            </T>
          ) : null}
          {has ? <Button small variant="ghost" label={`Standaard ${wd} wissen`} onPress={() => setConfirm('clear')} /> : null}
        </View>
      )}
    </Card>
  );
}
