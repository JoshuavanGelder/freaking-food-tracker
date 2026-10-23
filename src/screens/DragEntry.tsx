import React, { useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { C } from '../theme';
import { Icon } from '../icons';
import { DropZone, zoneAt } from '../logic/dragdrop';

type Props = {
  /** Inhoud van de rij (naam, hoeveelheid, verwijderknop). */
  children: React.ReactNode;
  label: string;
  /** Meet de maaltijdkaarten (schermcoördinaten) op het moment dat het slepen begint. */
  measureZones: () => Promise<DropZone[]>;
  onHover: (zone: string | null) => void;
  /** Losgelaten boven een zone. Verplaatsen zelf doet de ouder. */
  onDrop: (zone: string) => void;
  onActive: (active: boolean) => void;
};

/**
 * Rij met een greep links. Aan de greep vasthouden en slepen: de rij volgt je vinger en de maaltijd
 * eronder licht op. Loslaten boven een andere maaltijd verplaatst het product. De greep neemt de aanraking
 * volledig over, dus het scherm scrolt tijdens het slepen niet mee.
 */
export function DragEntryRow({ children, label, measureZones, onHover, onDrop, onActive }: Props) {
  const ty = useRef(new Animated.Value(0)).current;
  const handle = useRef<View>(null);
  const live = useRef({ measureZones, onHover, onDrop, onActive });
  live.current = { measureZones, onHover, onDrop, onActive };
  const drag = useRef({ zones: [] as DropZone[], center: null as number | null, over: null as string | null });

  const finish = (drop: boolean) => {
    const { over } = drag.current;
    drag.current = { zones: [], center: null, over: null };
    live.current.onHover(null);
    live.current.onActive(false);
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    if (drop && over) live.current.onDrop(over);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Niet afstaan aan de ScrollView: anders stopt het slepen zodra het scherm begint te scrollen.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        ty.stopAnimation();
        drag.current = { zones: [], center: null, over: null };
        live.current.onActive(true);
        handle.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          drag.current.center = y + h / 2;
        });
        live.current.measureZones().then((zones) => {
          drag.current.zones = zones;
        });
      },
      onPanResponderMove: (_e: unknown, g: { dy: number }) => {
        ty.setValue(g.dy);
        const { center, zones } = drag.current;
        if (center == null || !zones.length) return;
        const over = zoneAt(zones, center + g.dy);
        if (over !== drag.current.over) {
          drag.current.over = over;
          live.current.onHover(over);
        }
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
    }),
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateY: ty }], flexDirection: 'row', alignItems: 'center' }}>
      <View
        ref={handle}
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Houd vast en sleep naar een andere maaltijd"
        style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="grip" size={20} color={C.muted} />
      </View>
      {children}
    </Animated.View>
  );
}
