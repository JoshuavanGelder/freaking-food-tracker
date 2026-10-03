import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { addDays, dateKey } from '../logic/calc';
import { MEALS, MealId, mealForNow } from '../store';
import { C } from '../theme';
import { Button, Row, Segmented, T } from '../ui';

/**
 * Popup onderaan het scherm: kies aan welke maaltijd (en welke dag) je iets toevoegt.
 * De maaltijd die bij het tijdstip past staat vol groen, de rest als omlijnde knop.
 */
export function MealSheet({
  visible,
  title,
  subtitle,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onPick: (meal: MealId, date: string, dayLabel: string) => void;
  onClose: () => void;
}) {
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const suggested = mealForNow();
  const today = dateKey(new Date());
  const date = day === 'today' ? today : addDays(today, -1);
  const label = day === 'today' ? 'vandaag' : 'gisteren';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
        <Pressable accessibilityLabel="Sluiten" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: C.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 32,
            gap: 14,
          }}
        >
          <View style={{ gap: 2 }}>
            <T size={18} weight="bold" numberOfLines={2}>
              {title}
            </T>
            {subtitle ? (
              <T size={13} color={C.muted} numberOfLines={2}>
                {subtitle}
              </T>
            ) : null}
          </View>

          <Segmented<'today' | 'yesterday'>
            options={[
              { value: 'today', label: 'Vandaag' },
              { value: 'yesterday', label: 'Gisteren' },
            ]}
            value={day}
            onChange={setDay}
          />

          <T size={13} weight="semibold" color={C.muted}>
            Toevoegen aan
          </T>
          {[MEALS.slice(0, 2), MEALS.slice(2, 4)].map((pair, i) => (
            <Row key={i} style={{ gap: 10 }}>
              {pair.map((m) => (
                <Button
                  key={m.id}
                  label={m.label}
                  variant={m.id === suggested ? 'primary' : 'outline'}
                  onPress={() => onPick(m.id, date, label)}
                  style={{ flex: 1 }}
                />
              ))}
            </Row>
          ))}

          <Button small variant="ghost" label="Annuleren" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
