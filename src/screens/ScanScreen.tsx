import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lookupBarcode } from '../logic/off';
import { MealId, useApp } from '../store';
import { useNav } from '../nav';
import { C } from '../theme';
import { BackHeader, Button, Empty, IconButton, Screen, T } from '../ui';

export function ScanScreen({ meal, date }: { meal: MealId; date: string }) {
  const { state } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ code: string; text: string } | null>(null);
  const handled = useRef(false);

  const onScan = async ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    const code = data.trim();
    // Eerst kijken of we het product al kennen (werkt ook offline).
    const known = state.foods['off:' + code] ?? state.foods['eigen:' + code];
    // Producten uit een oudere versie (zonder eenheid) halen we opnieuw op.
    if (known && (known.source === 'eigen' || known.unit)) {
      nav.replace({ name: 'product', food: known, meal, date, grams: state.lastPortion[known.id] });
      return;
    }
    setBusy(true);
    try {
      const r = await lookupBarcode(code);
      if (r.kind === 'found') {
        nav.replace({ name: 'product', food: r.food, meal, date, grams: state.lastPortion[r.food.id] });
        return;
      }
      setProblem({
        code,
        text:
          r.kind === 'incomplete'
            ? `${r.name ? `"${r.name}"` : 'Dit product'} staat in Open Food Facts, maar zonder voedingswaarden. Voer ze zelf in vanaf het etiket.`
            : 'Deze barcode staat niet in Open Food Facts. Voer het product zelf in; de volgende keer herkent de app hem.',
      });
    } catch (e: any) {
      setProblem({ code, text: e?.message ?? 'Opzoeken lukte niet.' });
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setProblem(null);
    handled.current = false;
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

  if (problem) {
    return (
      <Screen>
        <BackHeader title="Barcode scannen" onBack={nav.back} />
        <Empty title={`Barcode ${problem.code}`} text={problem.text}>
          <Button small label="Zelf invoeren" onPress={() => nav.replace({ name: 'manual', meal, date, barcode: problem.code })} />
          <Button small variant="outline" label="Opnieuw scannen" onPress={retry} />
        </Empty>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={busy ? undefined : onScan}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 8 }}>
        <IconButton icon="back" label="Terug" onPress={nav.back} color={C.white} bg="#00000066" />
      </View>
      <View style={styles.frame} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 40, alignItems: 'center', gap: 12 }}>
        {busy ? <ActivityIndicator color={C.white} /> : null}
        <View style={{ backgroundColor: '#000000AA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
          <T color={C.white} weight="semibold">
            {busy ? 'Product opzoeken…' : 'Richt de camera op de barcode'}
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '36%',
    height: 150,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 18,
    pointerEvents: 'none',
  },
});
