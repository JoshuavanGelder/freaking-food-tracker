// Controleert bij GitHub Releases of er een nieuwere APK is. Werkt alleen als de repo openbaar is;
// bij een fout (offline, privé, rate limit) blijft het stil en gebeurt er niets.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { RELEASES_URL, ReleaseInfo, parseRelease, shouldCheck, updateToShow } from './logic/update';

const KEY = 'fft-update-v1';

/** Buildnummer van deze app (GitHub-run, zie app.config.js). 0 = onbekend (lokale ontwikkelbuild): dan geen melding. */
export const CURRENT_BUILD: number = Number((Constants.expoConfig?.extra as { build?: number } | undefined)?.build) || 0;

type Saved = { lastCheck: number; dismissed: number; release: ReleaseInfo | null };
export type UpdateStatus = { checking: boolean; checkedAt: number; error: boolean; update: ReleaseInfo | null };

let saved: Saved = { lastCheck: 0, dismissed: 0, release: null };
let status: UpdateStatus = { checking: false, checkedAt: 0, error: false, update: null };
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  status = { ...status, update: updateToShow(CURRENT_BUILD, saved.release, saved.dismissed) };
  listeners.forEach((l) => l());
}
function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {});
}
function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const p = JSON.parse(raw);
          saved = { lastCheck: Number(p.lastCheck) || 0, dismissed: Number(p.dismissed) || 0, release: parseRelease(p.release) ? p.release : null };
        }
      })
      .catch(() => {})
      .then(() => {
        status = { ...status, checkedAt: saved.lastCheck };
        emit();
      });
  }
  return loaded;
}

/** Kijkt of er een nieuwere versie is. `force` slaat de wachttijd over (knop "Controleren"). */
export async function checkForUpdate(force = false): Promise<void> {
  await load();
  if (status.checking || !CURRENT_BUILD) return;
  if (!shouldCheck(Date.now(), saved.lastCheck, force)) return;
  status = { ...status, checking: true, error: false };
  emit();
  try {
    const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    const release = parseRelease(await res.json());
    saved = { ...saved, lastCheck: Date.now(), release };
    status = { ...status, checking: false, checkedAt: saved.lastCheck, error: false };
    persist();
  } catch {
    // Bij een fout proberen we het bij de volgende keer weer; lastCheck blijft staan.
    status = { ...status, checking: false, error: true };
  }
  emit();
}

/** "Later": deze versie niet meer aanbieden. Een nieuwere versie komt wel weer. */
export function dismissUpdate(build: number) {
  saved = { ...saved, dismissed: Math.max(saved.dismissed, build) };
  persist();
  emit();
}

export function useUpdate(): UpdateStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    const l = () => setS(status);
    listeners.add(l);
    load().then(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return s;
}
