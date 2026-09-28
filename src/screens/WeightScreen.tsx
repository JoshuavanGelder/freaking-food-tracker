import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  addDays,
  dailyWeights,
  dateKey,
  daysBetween,
  daysToTarget,
  formatDate,
  formatShort,
  nl,
  parseKey,
  parseNumber,
  trendLine,
  trendSlope,
} from '../logic/calc';
import { useApp } from '../store';
import { useGoal } from '../useGoal';
import { C, F } from '../theme';
import { Button, Card, Chip, Empty, Field, H1, IconButton, Row, Screen, T } from '../ui';

export function WeightScreen() {
  const { state, actions } = useApp();
  const goal = useGoal();
  const { width } = useWindowDimensions();
  const [logging, setLogging] = useState(false);
  const [text, setText] = useState('');
  const [logDate, setLogDate] = useState(() => dateKey(new Date()));
  const [saved, setSaved] = useState<string | null>(null);

  const today = dateKey(new Date());
  const days = useMemo(() => dailyWeights(state.weights), [state.weights]);
  const trend = useMemo(() => trendLine(state.weights), [state.weights]);
  const slope = useMemo(() => trendSlope(state.weights), [state.weights]);
  const target = state.goals.targetWeight;

  const latest = days.length ? days[days.length - 1] : null;
  const trendNow = trend.length ? trend[trend.length - 1].kg : null;
  const trendDays = trendNow != null && slope != null && target ? daysToTarget(trendNow, target, slope) : null;
  const pace = goal?.result.pace ?? 0; // kg per week, positief = afvallen
  const planDays = trendNow != null && target ? daysToTarget(trendNow, target, -pace / 7) : null;

  const parsed = parseNumber(text);
  const valid = parsed != null && parsed >= 30 && parsed <= 300;
  const existing = days.find((d) => d.date === logDate);
  const save = () => {
    if (!valid) return;
    const kg = Math.round(parsed! * 10) / 10;
    actions.addWeight(logDate, kg);
    setSaved(`${formatDate(logDate)}: ${nl(kg, 1)} kg opgeslagen`);
    setText('');
  };
  const pickDate = () => {
    DateTimePickerAndroid.open({
      value: parseKey(logDate),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          setLogDate(dateKey(date));
          setSaved(null);
        }
      },
    });
  };

  const chartW = width - 40 - 32;

  return (
    <Screen withTabBar>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Gewicht</H1>
        <Button
          small
          icon={logging ? undefined : 'plus'}
          variant={logging ? 'outline' : 'primary'}
          label={logging ? 'Klaar' : 'Loggen'}
          onPress={() => {
            setLogging(!logging);
            setSaved(null);
            setLogDate(today);
          }}
        />
      </Row>

      {logging ? (
        <Card>
          <T size={13} weight="semibold" color={C.muted}>
            Gemeten op
          </T>
          <Row style={{ gap: 8 }}>
            <Chip label="Vandaag" on={logDate === today} onPress={() => { setLogDate(today); setSaved(null); }} />
            <Chip label="Gisteren" on={logDate === addDays(today, -1)} onPress={() => { setLogDate(addDays(today, -1)); setSaved(null); }} />
            <Chip
              label={logDate < addDays(today, -1) ? formatShort(logDate) : 'Andere dag'}
              on={logDate < addDays(today, -1)}
              onPress={pickDate}
            />
          </Row>
          <Row style={{ gap: 10, alignItems: 'flex-end' }}>
            <Field label={`Gewicht op ${formatDate(logDate, false)}`} value={text} onChangeText={setText} unit="kg" invalid={text !== '' && !valid} style={{ flex: 1 }} onSubmitEditing={save} />
            <Button small label="Opslaan" onPress={save} disabled={!valid} style={{ height: 48 }} />
          </Row>
          {existing ? (
            <T size={12} color={C.warn}>
              Op deze dag staat al {nl(existing.kg, 1)} kg; opslaan vervangt die meting.
            </T>
          ) : null}
          {saved ? (
            <T size={13} weight="semibold" color={C.accent}>
              {saved}. Kies eventueel een andere dag voor de volgende meting.
            </T>
          ) : null}
          <T size={12} color={C.muted}>
            Weeg je het liefst elke ochtend op dezelfde manier. Schommelingen door vocht vallen weg in de trend.
          </T>
        </Card>
      ) : null}

      <Row style={{ gap: 10 }}>
        <Tile label={latest?.date === today ? 'Vandaag' : 'Laatste'} value={latest ? `${nl(latest.kg, 1)} kg` : '–'} />
        <Tile label="Trend" value={trendNow != null ? `${nl(trendNow, 1)} kg` : '–'} />
        <Tile label="Doel" value={target ? `${nl(target, 1)} kg` : '–'} />
      </Row>

      {days.length >= 2 && target ? (
        <Card>
          <Chart
            width={chartW}
            days={days}
            trend={trend}
            target={target}
            prognosisDays={trendDays}
            today={today}
          />
          <Row style={{ gap: 16 }}>
            <Legend kind="dot" label="Metingen" />
            <Legend kind="line" label="Trend (7 dagen)" />
            <Legend kind="dash" label="Prognose" />
          </Row>
        </Card>
      ) : (
        <Empty title="Nog te weinig metingen" text="Log een paar dagen je gewicht. Vanaf twee metingen zie je hier je grafiek, trend en prognose." />
      )}

      <Row style={{ gap: 10, alignItems: 'stretch' }}>
        <Card style={{ flex: 1, gap: 4, padding: 14 }}>
          <T size={12} color={C.muted}>
            Volgens je trend
          </T>
          <T size={16} weight="bold">
            {trendDays != null ? formatDate(addDays(today, trendDays)) : '–'}
          </T>
          <T size={12} color={C.muted}>
            {slope != null ? `${slope <= 0 ? '−' : '+'}${nl(Math.abs(slope * 7), 2)} kg per week` : 'Nog geen trend'}
          </T>
        </Card>
        <Card style={{ flex: 1, gap: 4, padding: 14 }}>
          <T size={12} color={C.muted}>
            Volgens plan
          </T>
          <T size={16} weight="bold">
            {planDays != null ? formatDate(addDays(today, planDays)) : '–'}
          </T>
          <T size={12} color={C.muted}>
            {`${pace >= 0 ? '−' : '+'}${nl(Math.abs(pace), 2)} kg per week`}
          </T>
        </Card>
      </Row>

      {days.length ? (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {[...days]
            .reverse()
            .slice(0, 10)
            .map((d) => (
              <Row key={d.date} style={{ justifyContent: 'space-between' }}>
                <T size={14}>{formatDate(d.date)}</T>
                <Row style={{ gap: 2 }}>
                  <T size={14} weight="bold">
                    {nl(d.kg, 1)} kg
                  </T>
                  <IconButton icon="close" label={`Meting van ${formatDate(d.date)} verwijderen`} onPress={() => actions.removeWeight(d.date)} iconSize={18} />
                </Row>
              </Row>
            ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: 12, borderRadius: 14 }}>
      <T size={12} color={C.muted}>
        {label}
      </T>
      <T size={18} weight="bold" numberOfLines={1}>
        {value}
      </T>
    </Card>
  );
}

function Legend({ kind, label }: { kind: 'dot' | 'line' | 'dash'; label: string }) {
  return (
    <Row style={{ gap: 6 }}>
      {kind === 'dot' ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#B9B6AD' }} />
      ) : kind === 'line' ? (
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: C.accent }} />
      ) : (
        <View style={{ width: 16, height: 0, borderTopWidth: 2.5, borderStyle: 'dashed', borderColor: C.accent }} />
      )}
      <T size={12} color={C.muted}>
        {label}
      </T>
    </Row>
  );
}

function Chart({
  width,
  days,
  trend,
  target,
  prognosisDays,
  today,
}: {
  width: number;
  days: { date: string; kg: number }[];
  trend: { date: string; kg: number }[];
  target: number;
  prognosisDays: number | null;
  today: string;
}) {
  const H = 210;
  const top = 12;
  const bottom = 186;
  const left = 6;
  const right = width - 6;

  // Maximaal de laatste 90 dagen, plus de prognose (maximaal een jaar vooruit).
  const recent = days.filter((d) => daysBetween(d.date, today) <= 90);
  const shown = recent.length >= 2 ? recent : days.slice(-2);
  const start = shown[0].date;
  const lastDate = shown[shown.length - 1].date;
  const prog = prognosisDays != null ? Math.min(prognosisDays, 365) : 0;
  const end = addDays(lastDate, Math.max(prog, 1));
  const span = Math.max(1, daysBetween(start, end));

  const values = [...shown.map((d) => d.kg), target];
  const max = Math.max(...values) + 0.5;
  const min = Math.min(...values) - 0.5;

  const X = (date: string) => left + (daysBetween(start, date) / span) * (right - left);
  const Y = (kg: number) => top + ((max - kg) / (max - min)) * (bottom - top);

  const shownTrend = trend.filter((t) => t.date >= start);
  const trendPath = shownTrend.map((t, i) => `${i ? 'L' : 'M'}${X(t.date).toFixed(1)} ${Y(t.kg).toFixed(1)}`).join(' ');
  const lastTrend = shownTrend[shownTrend.length - 1];
  const goalY = Y(target);

  return (
    <Svg width={width} height={H}>
      <Line x1={left} x2={right} y1={goalY} y2={goalY} stroke="#C9C6BD" strokeWidth={1} strokeDasharray="3 4" />
      <SvgText x={left} y={goalY - 6} fontSize={11} fill={C.muted} fontFamily={F.regular}>
        doel {nl(target, 1)} kg
      </SvgText>
      {shown.map((d) => (
        <Circle key={d.date} cx={X(d.date)} cy={Y(d.kg)} r={2.6} fill="#B9B6AD" />
      ))}
      {trendPath ? <Path d={trendPath} stroke={C.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {prognosisDays != null && lastTrend ? (
        <>
          <Line
            x1={X(lastTrend.date)}
            y1={Y(lastTrend.kg)}
            x2={X(addDays(lastTrend.date, prog))}
            y2={goalY}
            stroke={C.accent}
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
          <Circle cx={X(addDays(lastTrend.date, prog))} cy={goalY} r={5} fill={C.white} stroke={C.accent} strokeWidth={2.5} />
        </>
      ) : null}
      <SvgText x={left} y={H - 4} fontSize={11} fill={C.muted} fontFamily={F.regular}>
        {formatShort(start)}
      </SvgText>
      <SvgText x={right} y={H - 4} fontSize={11} fill={C.muted} fontFamily={F.regular} textAnchor="end">
        {formatShort(end)}
      </SvgText>
    </Svg>
  );
}
