import React, { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { dateKey } from '../logic/calc';
import { ExportScope, buildExport, exportFileName, exportRange, exportToText } from '../logic/exporter';
import { useApp } from '../store';
import { C } from '../theme';
import { Button, Row, T } from '../ui';

/** Gegevens exporteren: deze week (afgelopen 7 dagen) of alles, als JSON-bestand dat je kunt delen of bewaren. */
export function ExportSection() {
  const { state } = useApp();
  const [busy, setBusy] = useState<ExportScope | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const run = async (scope: ExportScope) => {
    setBusy(scope);
    setMsg(null);
    try {
      const today = dateKey(new Date());
      const range = exportRange(scope, today, state);
      if (!range) {
        setMsg({ text: 'Er is nog niets om te exporteren.' });
        return;
      }
      const text = exportToText(buildExport(scope, today, new Date().toISOString(), state));
      if (await Sharing.isAvailableAsync()) {
        const file = new File(Paths.cache, exportFileName(scope, today, range.from));
        if (file.exists) file.delete();
        file.create();
        file.write(text);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exporteer je gegevens' });
      } else {
        await Clipboard.setStringAsync(text);
        setMsg({ text: 'Delen kan hier niet. De gegevens staan op je klembord.' });
      }
    } catch (e: any) {
      setMsg({ text: `Exporteren lukte niet: ${e?.message ?? 'onbekende fout'}`, bad: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <T size={13} color={C.muted}>
        Exporteren: sla je gegevens op als bestand of deel ze, bijvoorbeeld met Claude. Deze week = de afgelopen 7 dagen.
      </T>
      <Row style={{ gap: 8 }}>
        <Button
          small
          variant="outline"
          label={busy === 'week' ? 'Bezig…' : 'Deze week'}
          disabled={busy != null}
          onPress={() => run('week')}
          style={{ flex: 1 }}
        />
        <Button
          small
          variant="outline"
          label={busy === 'all' ? 'Bezig…' : 'Alles'}
          disabled={busy != null}
          onPress={() => run('all')}
          style={{ flex: 1 }}
        />
      </Row>
      {msg ? (
        <T size={13} weight="semibold" color={msg.bad ? C.warn : C.muted}>
          {msg.text}
        </T>
      ) : null}
    </>
  );
}
