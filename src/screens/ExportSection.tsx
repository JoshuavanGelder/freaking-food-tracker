import React, { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { dateKey } from '../logic/calc';
import { ExportScope, buildExport, exportFileName, exportRange, exportToText } from '../logic/exporter';
import { useApp } from '../store';
import { C } from '../theme';
import { Button, Row, Segmented, T } from '../ui';

type Action = 'save' | 'share';

/**
 * Gegevens exporteren: deze week (afgelopen 7 dagen) of alles, als JSON-bestand.
 * "Opslaan op telefoon" laat je een map kiezen (bijv. Downloads); "Delen" opent het deel-menu.
 * Alleen "Alles" bevat een volledige reservekopie die je later kunt terugzetten.
 */
export function ExportSection() {
  const { state } = useApp();
  const [scope, setScope] = useState<ExportScope>('all');
  const [busy, setBusy] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const make = () => {
    const today = dateKey(new Date());
    const range = exportRange(scope, today, state);
    if (!range) return null;
    const data = buildExport(scope, today, new Date().toISOString(), state, scope === 'all' ? state : undefined);
    return { name: exportFileName(scope, today, range.from), text: exportToText(data) };
  };

  const run = async (action: Action) => {
    setBusy(action);
    setMsg(null);
    try {
      const out = make();
      if (!out) {
        setMsg({ text: 'Er is nog niets om te exporteren.' });
        return;
      }
      if (action === 'save') {
        let dir: Directory;
        try {
          dir = await Directory.pickDirectoryAsync();
        } catch {
          return; // map kiezen geannuleerd
        }
        const file = dir.createFile(out.name, 'application/json');
        file.write(out.text);
        setMsg({ text: `Opgeslagen als ${out.name}.` });
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        const file = new File(Paths.cache, out.name);
        if (file.exists) file.delete();
        file.create();
        file.write(out.text);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exporteer je gegevens' });
      } else {
        await Clipboard.setStringAsync(out.text);
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
        Exporteren: sla je gegevens op als bestand of deel ze, bijvoorbeeld met Claude.
      </T>
      <Segmented
        options={[
          { value: 'all', label: 'Alles' },
          { value: 'week', label: 'Deze week' },
        ]}
        value={scope}
        onChange={(v) => {
          setScope(v);
          setMsg(null);
        }}
      />
      <T size={12} color={C.muted} style={{ lineHeight: 17 }}>
        {scope === 'all'
          ? 'Alles is ook een reservekopie: je kunt hem terugzetten via Importeren of terugzetten.'
          : 'Deze week = de afgelopen 7 dagen. Handig om te delen; terugzetten kan alleen met Alles.'}{' '}
        Bij opslaan kies je een map, bijvoorbeeld Documenten (de map Downloads zelf staat Android niet toe, een map daarin wel).
      </T>
      <Row style={{ gap: 8 }}>
        <Button
          small
          label={busy === 'save' ? 'Bezig…' : 'Opslaan op telefoon'}
          disabled={busy != null}
          onPress={() => run('save')}
          style={{ flex: 1 }}
        />
        <Button
          small
          variant="outline"
          label={busy === 'share' ? 'Bezig…' : 'Delen'}
          disabled={busy != null}
          onPress={() => run('share')}
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
