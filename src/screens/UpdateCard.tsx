import React from 'react';
import { Linking, View } from 'react-native';
import { CURRENT_BUILD, checkForUpdate, dismissUpdate, useUpdate } from '../update';
import { C } from '../theme';
import { Button, Card, Row, T } from '../ui';

/** Melding bovenaan Vandaag: er staat een nieuwe versie klaar. Verdwijnt als je op "Later" tikt. */
export function UpdateBanner() {
  const { update } = useUpdate();
  if (!update) return null;
  return (
    <Card style={{ gap: 8, borderWidth: 1.5, borderColor: C.accent }}>
      <T size={15} weight="bold">
        Nieuwe versie beschikbaar
      </T>
      <T size={13} color={C.muted} style={{ lineHeight: 19 }}>
        Versie {update.build} staat klaar (jij hebt {CURRENT_BUILD}).
        {update.notes ? `\n${update.notes}` : ''}
      </T>
      <Row style={{ gap: 8 }}>
        <Button small label="Downloaden" onPress={() => Linking.openURL(update.apkUrl).catch(() => {})} style={{ flex: 1 }} />
        <Button small variant="ghost" label="Later" onPress={() => dismissUpdate(update.build)} />
      </Row>
      <T size={12} color={C.muted}>
        Open het gedownloade .apk-bestand om te installeren; je gegevens blijven staan.
      </T>
    </Card>
  );
}

/** Kaart op Doelen: versie en handmatig controleren. */
export function UpdateSection() {
  const { checking, checkedAt, error, update } = useUpdate();
  const when = checkedAt ? new Date(checkedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <View style={{ gap: 8 }}>
      <T size={13} color={C.muted}>
        {CURRENT_BUILD ? `Versie ${CURRENT_BUILD}.` : 'Ontwikkelversie.'}{' '}
        {update ? `Versie ${update.build} is beschikbaar.` : error ? 'Controleren lukte niet.' : when ? `Up-to-date (gecontroleerd ${when}).` : ''}
      </T>
      {update ? (
        <Button small label={`Versie ${update.build} downloaden`} onPress={() => Linking.openURL(update.apkUrl).catch(() => {})} />
      ) : (
        <Button small variant="outline" label={checking ? 'Controleren…' : 'Op updates controleren'} disabled={checking || !CURRENT_BUILD} onPress={() => checkForUpdate(true)} />
      )}
    </View>
  );
}
