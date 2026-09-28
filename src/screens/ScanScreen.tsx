import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nl } from '../logic/calc';
import { Food, isStoreLabel, lookupBarcode, normalizeBarcode, unitOf } from '../logic/off';
import { MealId, useApp } from '../store';
import { useNav } from '../nav';
import { C, shadow } from '../theme';
import { BackHeader, Button, Empty, IconButton, Row, Screen, T } from '../ui';

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
        {!hit ? (
          <View style={{ alignSelf: 'center', backgroundColor: '#000000AA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
            <T color={C.white} weight="semibold">
              Richt de camera op de barcode
            </T>
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
