import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, dateKey, formatLong, formatShort, nl } from '../logic/calc';
import type { Per100, Profile } from '../logic/calc';
import {
  MICROS,
  MicroInfo,
  MicroSummary,
  NutrientTotal,
  SALT_MAX,
  microTarget,
  satFatMax,
  saltOf,
  summarizeMicros,
} from '../logic/micros';
import { NEVO, withNevoData } from '../data/nevo';
import { useApp } from '../store';
import type { LogEntry } from '../store';
import { useNav } from '../nav';
import { useGoal } from '../useGoal';
import { C } from '../theme';
import { BackHeader, Bar, Card, Empty, H2, IconButton, Row, Screen, Segmented, T } from '../ui';

const LOW = '#86BE98';

/** Getal netjes: grote getallen heel, kleine met decimalen. */
export function fmtMicro(v: number): string {
  if (v >= 20) return nl(v);
  if (v >= 1) return nl(v, 1);
  if (v >= 0.1) return nl(v, 2);
  return v > 0 ? nl(v, 3) : '0';
}

export function summarizeLog(entries: LogEntry[], days: number): MicroSummary {
  return summarizeMicros(
    entries.map((e) => {
      const f = withNevoData(e.food);
      return { name: f.name, per: f.per, grams: e.grams };
    }),
    days,
  );
}

type Range = 'dag' | 'week';

export function MicrosScreen({ date }: { date: string }) {
  const { state } = useApp();
  const nav = useNav();
  const goal = useGoal();
  const [range, setRange] = useState<Range>('dag');
  const [day, setDay] = useState(date);
  const [open, setOpen] = useState<string | null>(null);
  const today = dateKey(new Date());

  const { s, logged, count } = useMemo(() => {
    const days = range === 'dag' ? [day] : Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
    const entries = state.log.filter((e) => days.includes(e.date));
    const loggedDays = new Set(entries.map((e) => e.date)).size;
    return { s: summarizeLog(entries, range === 'dag' ? 1 : Math.max(1, loggedDays)), logged: loggedDays, count: entries.length };
  }, [state.log, day, range]);

  const profile = state.profile;
  const kcalBase = goal?.result.goal ?? s.kcal;
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));

  return (
    <Screen>
      <BackHeader title="Vitamines en mineralen" onBack={nav.back} />

      <Row style={{ justifyContent: 'space-between', marginHorizontal: -8 }}>
        <IconButton icon="back" label="Eerder" onPress={() => setDay(addDays(day, range === 'dag' ? -1 : -7))} color={C.ink} />
        <T weight="semibold">
          {range === 'dag' ? formatLong(day) : `${formatShort(addDays(day, -6))} t/m ${formatShort(day)}`}
        </T>
        <IconButton
          icon="forward"
          label="Later"
          onPress={() => setDay(addDays(day, range === 'dag' ? 1 : 7) > today ? today : addDays(day, range === 'dag' ? 1 : 7))}
          color={day < today ? C.ink : C.line}
        />
      </Row>

      <Segmented<Range>
        options={[
          { value: 'dag', label: 'Dag' },
          { value: 'week', label: '7 dagen (gemiddeld)' },
        ]}
        value={range}
        onChange={setRange}
      />

      {!count ? (
        <Empty
          title="Nog niets gelogd"
          text={range === 'dag' ? 'Op deze dag staat nog geen eten.' : 'In deze 7 dagen staat nog geen eten.'}
        />
      ) : (
        <>
          {range === 'week' ? (
            <T size={13} color={C.muted}>
              Gemiddeld per dag over {logged} {logged === 1 ? 'dag' : 'dagen'} met eten. Voor vitamines en mineralen zegt een week
              meer dan één dag.
            </T>
          ) : null}

          {s.anyKnown < 0.9 ? (
            <View style={{ borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#B453091A', gap: 4 }}>
              <T size={14} weight="bold">
                Bekend voor {nl(s.anyKnown * 100)}% van je kcal
              </T>
              <T size={13} color={C.soft} style={{ lineHeight: 19 }}>
                Basisproducten (NEVO) hebben alle waarden; merkproducten uit Open Food Facts meestal alleen zout, suiker en
                verzadigd vet. Je echte inname ligt dus waarschijnlijk hoger. Zoek je iets als basisproduct (bijv. "banaan"),
                dan telt het volledig mee.
              </T>
            </View>
          ) : null}

          <Card>
            <H2>Beperken</H2>
            <LimitRow
              label="Zout"
              t={s.salt}
              max={SALT_MAX}
              unit="g"
              note="Max. 6 gram per dag. Zout = natrium × 2,5."
              open={open === 'salt'}
              onPress={() => toggle('salt')}
            />
            <LimitRow
              label="Verzadigd vet"
              t={s.satFat}
              max={satFatMax(kcalBase)}
              unit="g"
              note={`Max. 10% van je energie: ${nl(satFatMax(kcalBase))} g bij ${nl(kcalBase)} kcal.`}
              open={open === 'satFat'}
              onPress={() => toggle('satFat')}
            />
            <LimitRow
              label="Suikers"
              t={s.sugar}
              unit="g"
              note="Alle suikers, ook die uit fruit en melk. Daar is geen norm voor; minder toegevoegde suiker is beter."
              open={open === 'sugar'}
              onPress={() => toggle('sugar')}
            />
          </Card>

          <Card>
            <H2>Vitamines</H2>
            {MICROS.filter((m) => m.group === 'vitamine').map((m) => (
              <MicroRow key={m.key} m={m} t={s.micro[m.key]} profile={profile} open={open === m.key} onPress={() => toggle(m.key)} />
            ))}
          </Card>

          <Card>
            <H2>Mineralen</H2>
            {MICROS.filter((m) => m.group === 'mineraal' && m.key !== 'na').map((m) => (
              <MicroRow key={m.key} m={m} t={s.micro[m.key]} profile={profile} open={open === m.key} onPress={() => toggle(m.key)} />
            ))}
          </Card>
        </>
      )}

      <T size={11} color={C.muted} style={{ lineHeight: 16, paddingHorizontal: 4 }}>
        Normen: Gezondheidsraad, Voedingsnormen voor vitamines en mineralen voor volwassenen (2018), aanbevolen hoeveelheid of
        adequate inname voor {profile?.sex === 'vrouw' ? 'vrouwen' : 'mannen'} van {profile?.age ?? '?'} jaar. Zout: Richtlijnen goede
        voeding 2015. Gebaseerd op gegevens van {NEVO.source} en andere gegevens. Geen medisch advies.
      </T>
    </Screen>
  );
}

function Details({ t, unit, extra }: { t: NutrientTotal; unit: string; extra?: string }) {
  return (
    <View style={{ gap: 2, paddingTop: 2 }}>
      {extra ? (
        <T size={12} color={C.soft}>
          {extra}
        </T>
      ) : null}
      {t.top.length ? (
        <T size={12} color={C.soft}>
          Vooral uit: {t.top.map((x) => `${x.name} (${fmtMicro(x.amount)} ${unit})`).join(', ')}
        </T>
      ) : null}
      <T size={12} color={C.muted}>
        {t.known >= 0.995 ? 'Bekend voor al je eten.' : `Bekend voor ${nl(t.known * 100)}% van je kcal; de rest telt als 0.`}
      </T>
    </View>
  );
}

function MicroRow({
  m,
  t,
  profile,
  open,
  onPress,
}: {
  m: MicroInfo;
  t: NutrientTotal;
  profile: Profile | null;
  open: boolean;
  onPress: () => void;
}) {
  const target = microTarget(m.key, profile)!;
  const pct = target ? t.amount / target : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${m.label}, ${nl(pct * 100)}% van de norm`} onPress={onPress} style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <T size={14} weight="semibold" style={{ flex: 1 }}>
          {m.label}
        </T>
        <T size={13} color={C.muted}>
          {fmtMicro(t.amount)} / {fmtMicro(target)} {m.unit}
        </T>
        <T size={13} weight="bold" style={{ width: 44, textAlign: 'right' }} color={pct >= 1 ? C.accent : C.ink}>
          {nl(Math.min(pct, 9.99) * 100)}%
        </T>
      </Row>
      <Bar pct={pct * 100} color={pct >= 1 ? C.accent : LOW} height={6} />
      {open ? <Details t={t} unit={m.unit} extra={m.why} /> : null}
    </Pressable>
  );
}

function LimitRow({
  label,
  t,
  max,
  unit,
  note,
  open,
  onPress,
}: {
  label: string;
  t: NutrientTotal;
  max?: number;
  unit: string;
  note: string;
  open: boolean;
  onPress: () => void;
}) {
  const pct = max ? t.amount / max : 0;
  const over = max != null && t.amount > max;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <T size={14} weight="semibold" style={{ flex: 1 }}>
          {label}
        </T>
        <T size={13} color={over ? C.warn : C.muted} weight={over ? 'bold' : 'regular'}>
          {nl(t.amount, 1)}
          {max != null ? ` / max. ${nl(max, max < 10 ? 1 : 0)}` : ''} {unit}
        </T>
      </Row>
      {max != null ? <Bar pct={pct * 100} color={over ? C.warn : C.accent} height={6} /> : null}
      {open ? <Details t={t} unit={unit} extra={note} /> : null}
    </Pressable>
  );
}

/** Vitamines en mineralen van één portie, voor op het productscherm. */
export function PortionMicros({ per, profile }: { per: Per100; profile: Profile | null }) {
  const [open, setOpen] = useState(false);
  const salt = saltOf(per);
  const known = MICROS.filter((m) => m.key !== 'na' && per.micro?.[m.key] != null);
  if (!known.length && salt == null && per.satFat == null && per.sugar == null) return null;
  return (
    <Card>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={14} weight="semibold" color={C.muted}>
            Vitamines, mineralen en meer
          </T>
          <T size={13} weight="bold" color={C.accent}>
            {open ? 'Verbergen' : 'Tonen'}
          </T>
        </Row>
      </Pressable>
      {open ? (
        <View style={{ gap: 6 }}>
          {salt != null ? <Line label="Zout" value={`${nl(salt, 2)} g`} sub={`${nl((salt / SALT_MAX) * 100)}% van max.`} /> : null}
          {per.satFat != null ? <Line label="Verzadigd vet" value={`${nl(per.satFat, 1)} g`} /> : null}
          {per.sugar != null ? <Line label="Suikers" value={`${nl(per.sugar, 1)} g`} /> : null}
          {known.map((m) => {
            const v = per.micro![m.key]!;
            const target = microTarget(m.key, profile)!;
            return <Line key={m.key} label={m.label} value={`${fmtMicro(v)} ${m.unit}`} sub={`${nl((v / target) * 100)}%`} />;
          })}
          {!known.length ? (
            <T size={12} color={C.muted}>
              Van dit product zijn geen vitamines en mineralen bekend.
            </T>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Line({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Row style={{ gap: 8 }}>
      <T size={14} style={{ flex: 1 }}>
        {label}
      </T>
      <T size={14} weight="semibold">
        {value}
      </T>
      <T size={12} color={C.muted} style={{ width: 70, textAlign: 'right' }}>
        {sub ?? ''}
      </T>
    </Row>
  );
}
