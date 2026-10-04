// AI-herkenning: foto maken, kiezen uit de galerij of gewoon beschrijven wat je at ("2 kiwi's en een banaan").
// De AI laat zien wat het is met (geschatte) grammen, en jij keurt het goed ("Dit zie ik") voordat het in je dagboek komt. Voedingswaarden komen uit NEVO
// en je eigen producten; alleen als daar niets bij past, gebruiken we de schatting van de AI.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as IMns from 'expo-image-manipulator';
import { nl } from '../logic/calc';
import { Food, unitOf } from '../logic/off';
import { nevoToFood, searchIn } from '../logic/nevo';
import { searchMine } from '../logic/mine';
import { Confidence, Finders, MatchSource, PhotoItem, matchAll, matchItem, parsePhotoResult, photoTotals } from '../logic/photofood';
import { NEVO } from '../data/nevo';
import { cloudConfigured, recognizeFood, useCloudStatus } from '../cloud';
import { MEALS, MealId, itemsKey, mealLabel, useApp } from '../store';
import { useNav } from '../nav';
import { C, F, shadow } from '../theme';
import { BackHeader, Button, Card, Empty, IconButton, Row, Screen, Segmented, T } from '../ui';

const IM: any = IMns;

/** Foto verkleinen tot max. 1024 px en als base64-JPEG teruggeven (scheelt upload, blijft scherp genoeg). */
async function shrink(uri: string, width: number, height: number): Promise<string | null> {
  const resize = width >= height ? { width: Math.min(1024, width || 1024) } : { height: Math.min(1024, height || 1024) };
  if (IM.ImageManipulator?.manipulate) {
    const ctx = IM.ImageManipulator.manipulate(uri);
    ctx.resize(resize);
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ format: IM.SaveFormat.JPEG, base64: true, compress: 0.7 });
    return saved.base64 ?? null;
  }
  const r = await IM.manipulateAsync(uri, [{ resize }], { format: IM.SaveFormat.JPEG, base64: true, compress: 0.7 });
  return r.base64 ?? null;
}

type Line = {
  key: string;
  food: Food;
  grams: number;
  text: string;
  source: MatchSource;
  /** Wat de AI zag; ontbreekt bij iets wat je zelf hebt toegevoegd. */
  item?: PhotoItem;
  alternatives: Food[];
};

/** Waar de herkenning vandaan komt: een foto (uri) of alleen je beschrijving (uri leeg). */
type Phase =
  | { kind: 'start' }
  | { kind: 'busy'; uri: string | null }
  | { kind: 'result'; uri: string | null; title: string; note: string; hiddenFat: boolean; used: number | null; limit: number | null }
  | { kind: 'error'; message: string };

let counter = 0;
const nextKey = () => `l${++counter}`;

const sourceOf = (f: Food): MatchSource => (f.id.startsWith('ai:') ? 'ai' : f.source === 'nevo' ? 'nevo' : 'mine');
const SOURCE_LABEL: Record<MatchSource, string> = { nevo: 'NEVO', mine: 'Jouw product', ai: 'Schatting (AI)' };
const CONF_LABEL: Record<Confidence, string> = { hoog: 'hoeveelheid vrij zeker', midden: 'hoeveelheid geschat', laag: 'hoeveelheid onzeker' };

export function PhotoScreen({ meal: startMeal, date, text }: { meal: MealId; date: string; text?: string }) {
  const { state, actions } = useApp();
  const nav = useNav();
  const cloud = useCloudStatus();
  const [meal, setMeal] = useState<MealId>(startMeal);
  const [hint, setHint] = useState(text ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'start' });
  const [lines, setLines] = useState<Line[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const find: Finders = useMemo(
    () => ({
      nevo: (q: string) => searchIn(NEVO.items, q, 10).map(nevoToFood),
      mine: (q: string) => searchMine(state, q),
    }),
    [state.foods, state.recent, state.favorites],
  );

  const signedIn = !!cloud.email;

  /** Stuurt een foto (base64) of alleen de beschrijving naar de AI en zet het resultaat klaar om na te kijken. */
  const recognize = async (uri: string | null, getImage: () => Promise<string | null>) => {
    setPhase({ kind: 'busy', uri });
    setLines([]);
    setOpenKey(null);
    setAdding(false);
    try {
      const b64 = uri ? await getImage() : null;
      if (uri && !b64) throw new Error('De foto kon niet worden gelezen. Probeer een andere.');
      const reply = await recognizeFood(b64, hint.trim());
      const result = parsePhotoResult(reply.result);
      const matches = matchAll(result, find);
      setLines(
        matches.map((m) => ({ key: nextKey(), food: m.food, grams: m.grams, text: String(m.grams), source: m.source, item: m.item, alternatives: m.alternatives })),
      );
      setPhase({ kind: 'result', uri, title: result.title, note: result.note, hiddenFat: result.hiddenFat, used: reply.used, limit: reply.limit });
    } catch (e: any) {
      setPhase({ kind: 'error', message: e?.message ?? 'Herkennen lukte niet. Probeer het opnieuw.' });
    }
  };

  const describe = () => {
    if (hint.trim().length < 2) return;
    recognize(null, async () => null);
  };

  // Vanuit het zoekveld ("Laat de AI dit invullen") meteen starten.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !text || text.trim().length < 2 || !signedIn) return;
    started.current = true;
    describe();
  }, [signedIn]);

  const pick = async (from: 'camera' | 'library') => {
    try {
      if (from === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          setPhase({ kind: 'error', message: 'De app mag de camera niet gebruiken. Zet het aan bij de app-instellingen van Android, of kies een foto uit je galerij.' });
          return;
        }
      }
      const opts: any = { mediaTypes: ['images'], quality: 1 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      await recognize(a.uri, () => shrink(a.uri, a.width, a.height));
    } catch (e: any) {
      setPhase({ kind: 'error', message: e?.message ?? 'Herkennen lukte niet. Probeer het opnieuw.' });
    }
  };

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setGrams = (key: string, text: string) => {
    const g = Number(text.replace(',', '.'));
    update(key, { text, grams: Number.isFinite(g) && g > 0 ? Math.min(5000, g) : 0 });
  };
  const step = (l: Line, d: number) => {
    const g = Math.max(0, Math.round((l.grams + d) / 5) * 5);
    update(l.key, { grams: g, text: String(g) });
  };
  const choose = (l: Line, f: Food) => {
    const alts = [l.food, ...l.alternatives].filter((x) => x.id !== f.id);
    update(l.key, { food: f, source: sourceOf(f), alternatives: alts });
    setOpenKey(null);
  };
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const addFood = (f: Food, grams?: number) => {
    const g = grams ?? state.lastPortion[f.id] ?? f.servingG ?? 100;
    setLines((ls) => [...ls, { key: nextKey(), food: f, grams: g, text: String(g), source: sourceOf(f), alternatives: [] }]);
    setAdding(false);
  };
  const addFat = (name: string, query: string, grams: number) => {
    const item: PhotoItem = { name, query, grams, unit: 'g', confidence: 'midden', portion: '', per: { kcal: 880, e: 0, k: 0, v: 99 } };
    const m = matchItem(item, find);
    setLines((ls) => [...ls, { key: nextKey(), food: m.food, grams, text: String(grams), source: m.source, item, alternatives: m.alternatives }]);
  };

  const valid = lines.filter((l) => l.grams > 0);
  const totals = photoTotals(valid);
  const items = valid.map((l) => ({ food: l.food, grams: l.grams }));
  const title = phase.kind === 'result' ? phase.title : 'Maaltijd';

  const logIt = (asFav: boolean) => {
    if (!items.length) return;
    if (asFav && !state.favMeals.some((f) => itemsKey(f.items) === itemsKey(items))) actions.toggleFavMeal(title, items);
    actions.addFavMealTo({ id: 'foto', name: title, items }, date, meal);
    nav.home();
  };

  if (!cloudConfigured || !signedIn) {
    return (
      <Screen>
        <BackHeader title="Herkennen met AI" onBack={nav.back} />
        <Empty
          title="Log in om de AI te gebruiken"
          text="Foto's en beschrijvingen worden op de server herkend, zodat de AI-sleutel geheim blijft. Daarvoor moet je ingelogd zijn. Zoeken en scannen werken ook zonder."
        >
          <Button small variant="outline" label="Inloggen" onPress={() => nav.push({ name: 'cloud' })} />
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title={phase.kind === 'result' ? 'Dit zie ik' : 'Herkennen met AI'} onBack={nav.back} />

      {phase.kind === 'start' || phase.kind === 'error' ? (
        <>
          {phase.kind === 'error' ? (
            <Card style={{ borderWidth: 1.5, borderColor: C.warn }}>
              <T size={15} weight="bold" color={C.warn}>
                Dat lukte niet
              </T>
              <T size={14} color={C.soft} style={{ lineHeight: 20 }}>
                {phase.message}
              </T>
            </Card>
          ) : (
            <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
              Beschrijf wat je at, of maak een foto van je bord. De AI maakt er een lijst van met grammen; jij kijkt het na voordat het in je dagboek komt.
            </T>
          )}
          <View style={{ gap: 6 }}>
            <T size={13} weight="semibold" color={C.muted}>
              Wat at of dronk je?
            </T>
            <TextInput
              accessibilityLabel="Beschrijf wat je at"
              value={hint}
              onChangeText={setHint}
              placeholder="Bijv. 2 kiwi's en een banaan"
              placeholderTextColor="#9A9D96"
              multiline
              maxLength={500}
              style={{
                minHeight: 48,
                borderWidth: 1.5,
                borderColor: C.line,
                borderRadius: 12,
                backgroundColor: C.card,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontFamily: F.regular,
                fontSize: 15,
                color: C.ink,
              }}
            />
          </View>
          <Button label="Herken tekst" icon="edit" disabled={hint.trim().length < 2} onPress={describe} />
          <T size={13} weight="semibold" color={C.muted} style={{ textAlign: 'center', marginVertical: 2 }}>
            of met een foto (je tekst geldt dan als hint)
          </T>
          <Row style={{ gap: 10 }}>
            <Button label="Foto maken" icon="camera" variant="outline" onPress={() => pick('camera')} style={{ flex: 1 }} small />
            <Button label="Galerij" icon="image" variant="outline" onPress={() => pick('library')} style={{ flex: 1 }} small />
          </Row>
          <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
            Je tekst of foto gaat via onze server naar Google Gemini en wordt niet bewaard.
          </T>
        </>
      ) : null}

      {phase.kind === 'busy' ? (
        <Card style={{ alignItems: 'center', gap: 14 }}>
          {phase.uri ? (
            <Image source={{ uri: phase.uri }} style={{ width: '100%', height: 220, borderRadius: 14 }} resizeMode="cover" />
          ) : (
            <T size={15} color={C.soft} style={{ textAlign: 'center', fontStyle: 'italic' }}>
              “{hint.trim()}”
            </T>
          )}
          <ActivityIndicator color={C.accent} />
          <T size={15} weight="semibold">
            {phase.uri ? 'Even kijken wat er op je bord ligt…' : 'Even uitzoeken wat je bedoelt…'}
          </T>
        </Card>
      ) : null}

      {phase.kind === 'result' ? (
        <>
          <Row style={{ gap: 12 }}>
            {phase.uri ? <Image source={{ uri: phase.uri }} style={{ width: 72, height: 72, borderRadius: 12 }} resizeMode="cover" /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <T size={17} weight="bold" numberOfLines={2}>
                {phase.title}
              </T>
              <T size={13} color={C.muted}>
                {lines.length ? `${nl(totals.kcal)} kcal · E ${nl(totals.e)} g · K ${nl(totals.k)} g · V ${nl(totals.v)} g` : 'Niets herkend'}
              </T>
            </View>
          </Row>

          {phase.note ? (
            <Card style={{ backgroundColor: C.accentTint, shadowOpacity: 0, elevation: 0 }}>
              <T size={14} color={C.soft} style={{ lineHeight: 20 }}>
                {phase.note}
              </T>
            </Card>
          ) : null}

          {lines.map((l) => (
            <LineCard
              key={l.key}
              line={l}
              open={openKey === l.key}
              onToggle={() => setOpenKey(openKey === l.key ? null : l.key)}
              onText={(t) => setGrams(l.key, t)}
              onStep={(d) => step(l, d)}
              onChoose={(f) => choose(l, f)}
              onRemove={() => remove(l.key)}
              find={find}
            />
          ))}

          {phase.hiddenFat ? (
            <Card>
              <T size={15} weight="bold">
                Gebakken in olie of boter?
              </T>
              <T size={14} color={C.muted} style={{ lineHeight: 20 }}>
                {phase.uri ? 'Dat zie je niet goed op een foto' : 'Dat stond er niet bij'}, maar het telt flink mee. Een eetlepel is ongeveer 10 g.
              </T>
              <Row style={{ gap: 8 }}>
                <Button small variant="outline" label="+ Olie 10 g" onPress={() => addFat('Olijfolie', 'olie olijf', 10)} style={{ flex: 1 }} />
                <Button small variant="outline" label="+ Boter 10 g" onPress={() => addFat('Boter', 'boter', 10)} style={{ flex: 1 }} />
              </Row>
            </Card>
          ) : null}

          {adding ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T size={15} weight="bold">
                  Iets toevoegen
                </T>
                <IconButton icon="close" label="Sluiten" onPress={() => setAdding(false)} iconSize={18} />
              </Row>
              <Picker find={find} onPick={(f) => addFood(f)} autoFocus />
            </Card>
          ) : (
            <Button small variant="ghost" icon="plus" label="Iets toevoegen dat mist" onPress={() => setAdding(true)} />
          )}

          <View style={{ gap: 6 }}>
            <T size={13} weight="semibold" color={C.muted}>
              Toevoegen aan
            </T>
            <Segmented<MealId> options={MEALS.map((m) => ({ value: m.id, label: m.label }))} value={meal} onChange={setMeal} />
          </View>

          <Button label={`Toevoegen aan ${mealLabel(meal).toLowerCase()}`} disabled={!items.length} onPress={() => logIt(false)} />
          <Button
            small
            variant="outline"
            icon="heart"
            label="Toevoegen en bewaren als favoriet"
            disabled={!items.length}
            onPress={() => logIt(true)}
          />
          <Button small variant="ghost" icon={phase.uri ? 'camera' : 'edit'} label={phase.uri ? 'Nieuwe foto' : 'Beschrijving aanpassen'} onPress={() => setPhase({ kind: 'start' })} />

          <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
            Grammen zijn een schatting van de AI: kijk ze na.{phase.used && phase.limit ? ` Vandaag ${phase.used} van ${phase.limit} keer AI gebruikt.` : ''} Waarden: NEVO-online versie 2025/9.0, RIVM, Bilthoven, of je eigen producten.
          </T>
        </>
      ) : null}
    </Screen>
  );
}

function LineCard({
  line: l,
  open,
  onToggle,
  onText,
  onStep,
  onChoose,
  onRemove,
  find,
}: {
  line: Line;
  open: boolean;
  onToggle: () => void;
  onText: (t: string) => void;
  onStep: (d: number) => void;
  onChoose: (f: Food) => void;
  onRemove: () => void;
  find: Finders;
}) {
  const u = unitOf(l.food);
  const kcal = (l.food.per.kcal * l.grams) / 100;
  const low = l.item?.confidence === 'laag';
  const sub = [
    SOURCE_LABEL[l.source],
    l.item && l.item.name.toLowerCase() !== l.food.name.toLowerCase() ? `AI: ${l.item.name}` : '',
    l.item?.portion ? l.item.portion : l.item ? CONF_LABEL[l.item.confidence] : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 12, paddingLeft: 16, gap: 10, ...shadow }}>
      <Row style={{ gap: 4, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15} weight="semibold" numberOfLines={2}>
            {l.food.name}
          </T>
          <T size={12} color={l.source === 'ai' || low ? C.warn : C.muted} numberOfLines={2}>
            {sub}
          </T>
        </View>
        <IconButton icon="close" label={`${l.food.name} weghalen`} onPress={onRemove} iconSize={18} size={36} />
      </Row>
      <Row style={{ gap: 8 }}>
        <IconButton icon="minus" label="Minder" onPress={() => onStep(-10)} color={C.accent} bg={C.accentTint} size={40} />
        <View style={{ width: 92 }}>
          <TextInput
            accessibilityLabel={`Hoeveelheid ${l.food.name}`}
            value={l.text}
            onChangeText={onText}
            keyboardType="decimal-pad"
            style={{
              height: 42,
              borderWidth: 1.5,
              borderColor: l.grams > 0 ? (low ? C.warn : C.line) : C.warn,
              borderRadius: 10,
              backgroundColor: C.card,
              paddingLeft: 12,
              paddingRight: 30,
              fontFamily: F.semibold,
              fontSize: 16,
              color: C.ink,
            }}
          />
          <T size={13} color={C.muted} style={{ position: 'absolute', right: 10, top: 12 }}>
            {u}
          </T>
        </View>
        <IconButton icon="plus" label="Meer" onPress={() => onStep(10)} color={C.accent} bg={C.accentTint} size={40} />
        <T size={15} weight="bold" style={{ flex: 1, textAlign: 'right' }}>
          {nl(kcal)} kcal
        </T>
      </Row>
      <Pressable accessibilityRole="button" onPress={onToggle} hitSlop={8}>
        <T size={13} weight="bold" color={C.accent}>
          {open ? 'Sluiten' : 'Ander product kiezen'}
        </T>
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          {l.alternatives.map((f) => (
            <FoodOption key={f.id} food={f} onPress={() => onChoose(f)} />
          ))}
          <Picker find={find} onPick={onChoose} initial={l.item?.query ?? ''} />
        </View>
      ) : null}
    </View>
  );
}

function FoodOption({ food, onPress }: { food: Food; onPress: () => void }) {
  const src = sourceOf(food);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Kies ${food.name}`}
      onPress={onPress}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}
    >
      <T size={14} weight="semibold" numberOfLines={1}>
        {food.name}
      </T>
      <T size={12} color={C.muted} numberOfLines={1}>
        {SOURCE_LABEL[src]}
        {food.brand ? ` · ${food.brand}` : ''} · {nl(food.per.kcal)} kcal per 100 {unitOf(food)}
      </T>
    </Pressable>
  );
}

/** Zoeken in NEVO en je eigen producten, tijdens het typen. */
function Picker({ find, onPick, initial = '', autoFocus }: { find: Finders; onPick: (f: Food) => void; initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const hits = useMemo(() => {
    if (q.trim().length < 2) return [];
    const seen = new Set<string>();
    const out: Food[] = [];
    for (const f of [...find.mine(q).slice(0, 3), ...find.nevo(q).slice(0, 6)]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    return out;
  }, [q, find]);
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        accessibilityLabel="Zoek een product"
        value={q}
        onChangeText={setQ}
        autoFocus={autoFocus}
        placeholder="Zoek, bijv. rijst"
        placeholderTextColor="#9A9D96"
        style={{
          height: 44,
          borderWidth: 1.5,
          borderColor: C.line,
          borderRadius: 12,
          backgroundColor: C.card,
          paddingHorizontal: 14,
          fontFamily: F.regular,
          fontSize: 15,
          color: C.ink,
        }}
      />
      {hits.map((f) => (
        <FoodOption key={f.id} food={f} onPress={() => onPick(f)} />
      ))}
      {q.trim().length >= 2 && !hits.length ? (
        <T size={13} color={C.muted}>
          Niets gevonden. Probeer een ander woord; merkproducten vind je via het gewone zoeken.
        </T>
      ) : null}
    </View>
  );
}
