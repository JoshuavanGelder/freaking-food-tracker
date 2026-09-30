import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  KeyboardTypeOptions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, shadow } from './theme';
import { Icon, IconName } from './icons';

// ---------- tekst ----------

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}

export function T({
  children,
  style,
  size = 15,
  weight = 'regular',
  color = C.ink,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  size?: number;
  weight?: 'regular' | 'semibold' | 'bold';
  color?: string;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: F[weight], fontSize: size, color }, style]}>
      {children}
    </Text>
  );
}

// ---------- layout ----------

/** Scrollend scherm met ruimte voor de statusbalk en (optioneel) de tabbalk. */
export function Screen({
  children,
  withTabBar = false,
  gap = 14,
}: {
  children: React.ReactNode;
  withTabBar?: boolean;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  // Het venster krimpt niet mee met het toetsenbord (edge-to-edge): laat het scrollgebied zelf boven het
  // toetsenbord eindigen, zodat het invoerveld in beeld scrolt en niets eronder verdwijnt.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e: { endCoordinates: { height: number } }) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: kb }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: kb ? 24 : (withTabBar ? 100 : 32) + insets.bottom,
          gap,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <Row style={{ marginLeft: -10, gap: 4 }}>
      <IconButton icon="back" label="Terug" onPress={onBack} color={C.ink} />
      <Text style={[s.h3, { flex: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </Row>
  );
}

// ---------- knoppen ----------

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = variant === 'primary' ? C.accent : variant === 'outline' ? C.card : 'transparent';
  const fg = variant === 'primary' ? C.white : variant === 'danger' ? C.warn : C.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: small ? 44 : 54,
          paddingHorizontal: small ? 16 : 20,
          borderRadius: small ? 12 : 16,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: C.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} strokeWidth={2.4} /> : null}
      <Text style={{ fontFamily: F.bold, fontSize: small ? 15 : 17, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color = C.muted,
  bg = 'transparent',
  fill,
  size = 44,
  iconSize = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  bg?: string;
  fill?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={iconSize} color={color} fill={fill} strokeWidth={icon === 'plus' || icon === 'minus' ? 2.4 : 2} />
    </Pressable>
  );
}

export function HeartButton({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <IconButton
      icon="heart"
      label={label}
      onPress={onPress}
      color={on ? C.accent : C.muted}
      fill={on ? C.accent : 'none'}
      iconSize={21}
    />
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[s.segmentItem, on && s.segmentOn]}
          >
            <Text style={{ fontFamily: F.semibold, fontSize: 14, color: on ? C.accent : C.muted }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, wide }: { label: string; on: boolean; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flexGrow: 1,
        flexBasis: wide ? 'auto' : '30%',
        height: 42,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: on ? C.accent : C.line,
        backgroundColor: on ? C.accentTint : C.card,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: wide ? 14 : 8,
      }}
    >
      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: on ? C.accent : C.ink }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- invoer ----------

export function Field({
  label,
  value,
  onChangeText,
  unit,
  keyboardType = 'decimal-pad',
  invalid,
  placeholder,
  style,
  inputStyle,
  onSubmitEditing,
  hideLabel,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  unit?: string;
  keyboardType?: KeyboardTypeOptions;
  invalid?: boolean;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onSubmitEditing?: () => void;
  hideLabel?: boolean;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {hideLabel ? null : <T size={13} weight="semibold" color={C.muted}>{label}</T>}
      <View>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor="#9A9D96"
          onSubmitEditing={onSubmitEditing}
          style={[
            s.input,
            { borderColor: invalid ? C.warn : C.line, paddingRight: unit ? 56 : 14 },
            inputStyle,
          ]}
        />
        {unit ? (
          <Text style={s.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------- voortgang ----------

export function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }}>
      <View style={{ height, width: `${w}%`, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function Ring({
  size = 150,
  stroke = 14,
  pct,
  color = C.accent,
  children,
}: {
  size?: number;
  stroke?: number;
  pct: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * p} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

export function MacroTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: C.bg, paddingVertical: 10, paddingHorizontal: 8, gap: 5 }}>
      <View style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: color }} />
      <T size={15} weight="bold" numberOfLines={1}>
        {value}
      </T>
      <T size={11} color={C.muted} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
      <T size={16} weight="bold" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T size={14} color={C.muted} style={{ textAlign: 'center', lineHeight: 20 }}>
          {text}
        </T>
      ) : null}
      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  h1: { fontFamily: F.display, fontSize: 30, color: C.ink, letterSpacing: -0.5 },
  h2: { fontFamily: F.display, fontSize: 19, color: C.ink },
  h3: { fontFamily: F.display, fontSize: 22, color: C.ink },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 12, ...shadow },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: C.segment, borderRadius: 12 },
  segmentItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentOn: { backgroundColor: C.card, ...shadow },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: C.card,
    paddingHorizontal: 14,
    fontFamily: F.semibold,
    fontSize: 16,
    color: C.ink,
  },
  unit: { position: 'absolute', right: 14, top: 14, fontFamily: F.regular, fontSize: 14, color: C.muted, pointerEvents: 'none' },
});
