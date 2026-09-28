import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as IMns from 'expo-image-manipulator';
import { decodeJpegBase64 } from '../logic/photoscan';
import { readBarcodeFromFile } from '../../modules/barcode-photo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nl } from '../logic/calc';
import { Food, isStoreLabel, lookupBarcode, normalizeBarcode, unitOf } from '../logic/off';
import { MealId, useApp } from '../store';
import { useNav } from '../nav';
import { C, shadow } from '../theme';
import { BackHeader, Button, Empty, Field, IconButton, Row, Screen, T } from '../ui';

const IM: any = IMns;

/** Foto verkleinen tot max. 1600 px breed en als base64-JPEG teruggeven. */
async function shrinkToBase64(uri: string): Promise<string | null> {
  if (IM.ImageManipulator?.manipulate) {
    const ctx = IM.ImageManipulator.manipulate(uri);
    ctx.resize({ width: 1600 });
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ format: IM.SaveFormat.JPEG, base64: true, compress: 0.9 });
    return saved.base64 ?? null;
  }
  const r = await IM.manipulateAsync(uri, [{ resize: { width: 1600 } }], { format: IM.SaveFormat.JPEG, base64: true, compress: 0.9 });
  return r.base64 ?? null;
}

type Hit =
  | { code: string; kind: 'loading' }
  | { code: string; kind: 'found'; food: Food }
  | { code: string; kind: 'missing'; text: string };

/**
 * De camera blijft scannen. Een gevonden product verschijnt onderin;
 * pas als je op "Verder" tikt ga je door. Een andere barcode vervangt het resultaat.
 */
export function ScanScreen({ meal, date }: { meal: MealId; date: string }) {
  const { state } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [hit, setHit] = useState<Hit | null>(null);
  const lastCode = useRef<string | null>(null);
  const busy = useRef(false);
  const cache = useRef<Record<string, Hit>>({});

  const [typing, setTyping] = useState(false);
  const camRef = useRef<any>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  // Na een paar seconden zonder resultaat bieden we de fotoscanner aan (leest ook GS1 DataBar).
  useEffect(() => {
    if (hit) return;
    const t = setTimeout(() => setShowPhoto(true), 2500);
    return () => clearTimeout(t);
  }, [hit]);

  const photoScan = async () => {
    if (!camRef.current || photoBusy) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.8, shutterSound: false, skipProcessing: true });
      // Eerst de native lezer (zxing-cpp, kan ook DataBar Expanded), anders de JavaScript-lezer.
      let text = pic?.uri ? await readBarcodeFromFile(pic.uri) : null;
      if (!text && pic?.uri) {
        const b64 = await shrinkToBase64(pic.uri);
        await new Promise((r) => setTimeout(r, 30));
        text = b64 ? decodeJpegBase64(b64) : null;
      }
      if (text && normalizeBarcode(text)) {
        lastCode.current = null;
        await onScan({ data: text });
      } else {
        setPhotoMsg('Geen barcode gevonden op de foto. Houd de telefoon stil en iets dichterbij, of typ de code in.');
      }
    } catch (e: any) {
      setPhotoMsg('De foto lezen lukte niet. Probeer het nog eens of typ de code in.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const [typed, setTyped] = useState('');
  const typedCode = normalizeBarcode(typed.replace(/\s/g, ''));

  const submitTyped = () => {
    if (!typedCode) return;
    lastCode.current = null;
    setTyping(false);
    setTyped('');
    onScan({ data: typedCode });
  };

  const onScan = async ({ data }: { data: string }) => {
    const code = normalizeBarcode(data);
    if (!code || code === lastCode.current || busy.current) return;
    lastCode.current = code;

    if (isStoreLabel(code)) {
      setHit({
        code,
        kind: 'missing',
        text: 'Dit is een weegetiket van de winkel; die codes staan in geen enkele database. Scan de gewone barcode op de verpakking als die er is, of zoek op naam.',
      });
      return;
    }

    // Eerst kijken of we het product al kennen (werkt ook offline). Je eigen aangepaste versie gaat voor.
    const known = state.foods['eigen:' + code] ?? state.foods['off:' + code];
    // Gescande producten uit een oudere app-versie (zonder barcode-veld) halen we opnieuw op.
    if (known && (known.source === 'eigen' || known.barcode)) {
      setHit({ code, kind: 'found', food: known });
      return;
    }
    if (cache.current[code]) {
      setHit(cache.current[code]);
      return;
    }
    busy.current = true;
    setHit({ code, kind: 'loading' });
    let result: Hit;
    try {
      const r = await lookupBarcode(code);
      result =
        r.kind === 'found'
          ? { code, kind: 'found', food: r.food }
          : {
              code,
              kind: 'missing',
              text:
                r.kind === 'incomplete'
                  ? `${r.name ? `"${r.name}"` : 'Dit product'} staat in Open Food Facts, maar zonder voedingswaarden.`
                  : 'Deze barcode staat niet in Open Food Facts.',
            };
      cache.current[code] = result;
    } catch (e: any) {
      result = { code, kind: 'missing', text: e?.message ?? 'Opzoeken lukte niet.' };
      lastCode.current = null; // bij een fout mag dezelfde code opnieuw
    } finally {
      busy.current = false;
    }
    setHit(result);
  };

  const clear = () => {
    setHit(null);
    lastCode.current = null;
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  if (!permission.granted) {
    return (
      <Screen>
        <BackHeader title="Barcode scannen" onBack={nav.back} />
        <Empty title="Camera nodig" text="Geef de app toegang tot je camera om barcodes te scannen. Foto's worden niet opgeslagen.">
          <Button small label="Camera toestaan" onPress={requestPermission} />
        </Empty>
      </Screen>
    );
  }

  const found = hit?.kind === 'found';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'datamatrix', 'qr'] }}
        onBarcodeScanned={onScan}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 8 }}>
        <IconButton icon="back" label="Terug" onPress={nav.back} color={C.white} bg="#00000066" />
      </View>
      <View style={[styles.frame, { borderColor: found ? '#4ADE80' : '#FFFFFF' }]} />

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 24, gap: 10 }}>
        {typing ? (
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 10, ...shadow }}>
            <Field
              label="Cijfers onder de barcode"
              value={typed}
              onChangeText={setTyped}
              keyboardType="number-pad"
              placeholder="Bijv. 8719587122211"
              invalid={typed.length > 7 && !typedCode}
              onSubmitEditing={submitTyped}
            />
            <T size={12} color={C.muted}>
              Bij vlees en vis van de versafdeling: typ de 14 cijfers na (01), zoals 08719587122211.
            </T>
            <Row style={{ gap: 8 }}>
              <Button small variant="outline" label="Annuleren" onPress={() => setTyping(false)} style={{ flex: 1 }} />
              <Button small label="Zoeken" onPress={submitTyped} disabled={!typedCode} style={{ flex: 1 }} />
            </Row>
          </View>
        ) : !hit ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: '#000000AA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
              <T color={C.white} weight="semibold">
                Richt de camera op de barcode
              </T>
            </View>
            {photoMsg ? (
              <View style={{ backgroundColor: '#000000AA', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
                <T size={13} color={C.white} style={{ textAlign: 'center' }}>
                  {photoMsg}
                </T>
              </View>
            ) : null}
            {showPhoto ? (
              <Button
                small
                icon={photoBusy ? undefined : 'barcode'}
                label={photoBusy ? 'Foto lezen…' : 'Wordt hij niet herkend? Foto-scan'}
                onPress={photoScan}
                disabled={photoBusy}
              />
            ) : null}
            <Button small variant="outline" label="Code intypen" onPress={() => setTyping(true)} />
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 12, ...shadow }}>
            {hit.kind === 'loading' ? (
              <Row style={{ gap: 10 }}>
                <ActivityIndicator color={C.accent} />
                <T weight="semibold">Barcode {hit.code} opzoeken…</T>
              </Row>
            ) : hit.kind === 'found' ? (
              <>
                <View style={{ gap: 2 }}>
                  <T size={17} weight="bold" numberOfLines={2}>
                    {hit.food.name}
                  </T>
                  <T size={13} color={C.muted} numberOfLines={1}>
                    {hit.food.brand ? `${hit.food.brand} · ` : ''}
                    {nl(hit.food.per.kcal)} kcal per 100 {unitOf(hit.food)}
                  </T>
                </View>
                <Row style={{ gap: 8 }}>
                  <Button small variant="outline" label="Opnieuw" onPress={clear} style={{ flex: 1 }} />
                  <Button
                    small
                    label="Verder"
                    onPress={() =>
                      nav.replace({ name: 'product', food: hit.food, meal, date, grams: state.lastPortion[hit.food.id] })
                    }
                    style={{ flex: 2 }}
                  />
                </Row>
              </>
            ) : (
              <>
                <View style={{ gap: 2 }}>
                  <T size={16} weight="bold">
                    Barcode {hit.code}
                  </T>
                  <T size={13} color={C.muted}>
                    {hit.text}
                    {isStoreLabel(hit.code) ? '' : ' Voer het zelf in vanaf het etiket; de volgende keer herkent de app hem.'}
                  </T>
                </View>
                <Row style={{ gap: 8 }}>
                  <Button small variant="outline" label="Zoeken" onPress={nav.back} style={{ flex: 1 }} />
                  <Button
                    small
                    label="Zelf invoeren"
                    onPress={() =>
                      nav.replace({ name: 'manual', meal, date, barcode: isStoreLabel(hit.code) ? undefined : hit.code })
                    }
                    style={{ flex: 1 }}
                  />
                </Row>
                <Button small variant="ghost" label="Opnieuw scannen" onPress={clear} />
              </>
            )}
            {hit.kind !== 'loading' ? (
              <T size={12} color={C.muted}>
                De camera blijft scannen. Richt op een andere barcode om te wisselen.
              </T>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '28%',
    height: 150,
    borderWidth: 3,
    borderRadius: 18,
    pointerEvents: 'none',
  },
});
