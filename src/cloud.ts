// Cloud: inloggen met Google en synchroniseren met Supabase, met gewone fetch-aanroepen
// (geen supabase-js, dus geen extra native afhankelijkheden). De logica zit in src/logic/sync.ts.

import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { SUPABASE_KEY, SUPABASE_URL } from './cloudConfig';
import {
  EMPTY_SNAPSHOT,
  EntryRow,
  LibraryRow,
  MetaRow,
  PushPlan,
  Remote,
  SyncSnapshot,
  SyncState,
  WeightRow,
  afterPush,
  applyPull,
  isEmptyPlan,
  planPush,
  stableStringify,
} from './logic/sync';
import { computeGoal, dailyWeights, macroGrams, splitFor } from './logic/calc';
import { FriendFavorites, parseFriendFavorites } from './logic/friends';

export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string };

type CloudData = {
  session: Session | null;
  name: string;
  snap: SyncSnapshot;
  cursor: { entries: string; weights: string };
  lastSync: string | null;
  /** Hash van het laatst verstuurde dagdoel (voor vrienden). */
  targetHash: string;
};

export type CloudStatus = {
  ready: boolean;
  email: string | null;
  name: string;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
};

const KEY = 'fft-cloud-v1';
const EMPTY: CloudData = { session: null, name: '', snap: EMPTY_SNAPSHOT, cursor: { entries: '', weights: '' }, lastSync: null, targetHash: '' };

let data: CloudData = EMPTY;
let status: CloudStatus = { ready: false, email: null, name: '', syncing: false, lastSync: null, error: null };
const listeners = new Set<() => void>();

function emit(patch: Partial<CloudStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

async function save() {
  await AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
}

let loading: Promise<void> | null = null;
export function loadCloud(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const p = JSON.parse(raw) as Partial<CloudData>;
          data = { ...EMPTY, ...p, snap: { ...EMPTY_SNAPSHOT, ...(p.snap ?? {}) }, cursor: { ...EMPTY.cursor, ...(p.cursor ?? {}) } };
        }
      })
      .catch(() => {})
      .finally(() => emit({ ready: true, email: data.session?.email ?? null, name: data.name, lastSync: data.lastSync }));
  }
  return loading;
}

// ---------- netwerk ----------

class CloudError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

function dutchError(status: number, body: any): string {
  const msg: string = String(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? '');
  const code: string = String(body?.error_code ?? body?.code ?? '');
  if (status === 429) return 'Even te veel pogingen. Wacht een paar minuten en probeer het opnieuw.';
  if (code === '42P01' || /relation .* does not exist/i.test(msg)) return 'De database is nog niet ingericht (schema.sql ontbreekt).';
  if (status === 401 || status === 403) return 'Je bent uitgelogd. Log opnieuw in.';
  return `Er ging iets mis bij de server (${status}${msg ? `: ${msg}` : ''}).`;
}

async function call(path: string, o: { method?: string; body?: unknown; token?: string; prefer?: string } = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(SUPABASE_URL.replace(/\/$/, '') + path, {
      method: o.method ?? 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        // De nieuwe publishable key is geen JWT: alleen meesturen als apikey, Authorization alleen met een sessie.
        ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
        'Content-Type': 'application/json',
        ...(o.prefer ? { Prefer: o.prefer } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
  } catch {
    throw new CloudError('Geen verbinding met internet. De app probeert het later opnieuw.');
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new CloudError(dutchError(res.status, body), res.status);
  return body;
}

function toSession(b: any, email?: string): Session {
  if (!b?.access_token || !b?.refresh_token || !b?.user?.id) throw new CloudError('Inloggen lukte niet: onverwacht antwoord van de server.');
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    expiresAt: Date.now() + (Number(b.expires_in) || 3600) * 1000,
    userId: b.user.id,
    email: b.user.email ?? email ?? '',
  };
}

// ---------- inloggen met Google ----------
// Via het Google-venster in de browser (Supabase OAuth, impliciete flow). Supabase stuurt terug naar
// REDIRECT met de sessie in het #-deel van de url. REDIRECT moet bij Supabase → URL Configuration staan,
// en het schema (freakingfoodtracker) staat in app.config.js.

export const REDIRECT = 'freakingfoodtracker://login';

/** Leest `a=1&b=2` uit het #- en ?-deel van een url. */
export function urlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = [url.split('#')[1] ?? '', (url.split('#')[0].split('?')[1] ?? '')];
  for (const part of parts) {
    for (const kv of part.split('&')) {
      if (!kv) continue;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

async function startSession(session: Session) {
  // Ander account dan eerst: opnieuw beginnen met synchroniseren (alles van de telefoon gaat dan omhoog).
  const sameUser = data.session?.userId === session.userId;
  data = { ...data, session, ...(sameUser ? {} : { snap: EMPTY_SNAPSHOT, cursor: EMPTY.cursor, lastSync: null }) };
  await save();
  emit({ email: session.email, error: null, lastSync: data.lastSync });
}

/** Opent het Google-inlogvenster. Geeft false terug als je het venster sluit zonder in te loggen. */
export async function signInWithGoogle(): Promise<boolean> {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(REDIRECT)}`;
  const res = await WebBrowser.openAuthSessionAsync(url, REDIRECT);
  if (res.type !== 'success' || !('url' in res) || !res.url) return false;
  const p = urlParams(res.url as string);
  if (p.error || p.error_description) {
    throw new CloudError(`Inloggen met Google lukte niet${p.error_description ? `: ${p.error_description}` : '.'}`);
  }
  if (!p.access_token || !p.refresh_token) throw new CloudError('Inloggen met Google lukte niet: geen sessie ontvangen.');
  const user = await call('/auth/v1/user', { token: p.access_token });
  await startSession(
    toSession({ access_token: p.access_token, refresh_token: p.refresh_token, expires_in: p.expires_in, user }),
  );
  return true;
}

/** Uitloggen. De gegevens blijven op de telefoon staan. */
export async function signOut(): Promise<void> {
  const s = data.session;
  data = { ...EMPTY };
  await save();
  emit({ email: null, name: '', lastSync: null, error: null });
  if (s) call('/auth/v1/logout', { method: 'POST', token: s.accessToken }).catch(() => {});
}

export async function setName(name: string): Promise<void> {
  data = { ...data, name: name.trim().slice(0, 40) };
  await save();
  emit({ name: data.name });
}

async function validSession(): Promise<Session> {
  const s = data.session;
  if (!s) throw new CloudError('Je bent niet ingelogd.');
  if (s.expiresAt - 60_000 > Date.now()) return s;
  try {
    const b = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refreshToken } });
    data = { ...data, session: toSession(b, s.email) };
    await save();
    return data.session!;
  } catch (e) {
    if (e instanceof CloudError && (e.status === 400 || e.status === 401 || e.status === 403)) {
      data = { ...data, session: null };
      await save();
      emit({ email: null });
      throw new CloudError('Je bent uitgelogd. Log opnieuw in.');
    }
    throw e;
  }
}

// ---------- synchroniseren ----------

const PAGE = 1000;

async function pullRows<R extends { synced_at: string }>(table: string, cols: string, s: Session, cursor: string): Promise<{ rows: R[]; cursor: string }> {
  const rows: R[] = [];
  let cur = cursor;
  for (;;) {
    const q = `?select=${cols},synced_at&user_id=eq.${s.userId}${cur ? `&synced_at=gt.${encodeURIComponent(cur)}` : ''}&order=synced_at.asc&limit=${PAGE}`;
    const page: R[] = await call(`/rest/v1/${table}${q}`, { token: s.accessToken });
    rows.push(...page);
    if (page.length) cur = page[page.length - 1].synced_at;
    if (page.length < PAGE) break;
  }
  return { rows, cursor: cur };
}

async function pull(s: Session): Promise<{ remote: Remote; cursor: CloudData['cursor'] }> {
  const [e, w, meta, lib] = await Promise.all([
    pullRows<EntryRow & { synced_at: string }>('entries', 'id,date,meal,food,grams,deleted,updated_ms', s, data.cursor.entries),
    pullRows<WeightRow & { synced_at: string }>('weights', 'date,kg,deleted,updated_ms', s, data.cursor.weights),
    call(`/rest/v1/profiles?select=profile,goals,prefs,name,updated_ms&user_id=eq.${s.userId}`, { token: s.accessToken }) as Promise<MetaRow[]>,
    call(`/rest/v1/libraries?select=data,updated_ms&user_id=eq.${s.userId}`, { token: s.accessToken }) as Promise<LibraryRow[]>,
  ]);
  return {
    remote: { entries: e.rows, weights: w.rows, meta: meta[0] ?? null, library: lib[0] ?? null },
    cursor: { entries: e.cursor, weights: w.cursor },
  };
}

function chunks<X>(list: X[], n: number): X[][] {
  const out: X[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const UPSERT = 'resolution=merge-duplicates,return=minimal';

async function push(s: Session, p: PushPlan): Promise<void> {
  const t = s.accessToken;
  const uid = s.userId;
  for (const part of chunks(p.upsertEntries, 300)) {
    await call('/rest/v1/entries?on_conflict=user_id,id', { method: 'POST', token: t, prefer: UPSERT, body: part.map((r) => ({ ...r, user_id: uid })) });
  }
  for (const part of chunks(p.deleteEntries, 100)) {
    await call(`/rest/v1/entries?user_id=eq.${uid}&id=in.(${part.map(encodeURIComponent).join(',')})`, {
      method: 'PATCH',
      token: t,
      prefer: 'return=minimal',
      body: { deleted: true, food: null, grams: null, updated_ms: Date.now() },
    });
  }
  if (p.upsertWeights.length) {
    await call('/rest/v1/weights?on_conflict=user_id,date', { method: 'POST', token: t, prefer: UPSERT, body: p.upsertWeights.map((r) => ({ ...r, user_id: uid })) });
  }
  if (p.deleteWeights.length) {
    await call(`/rest/v1/weights?user_id=eq.${uid}&date=in.(${p.deleteWeights.join(',')})`, {
      method: 'PATCH',
      token: t,
      prefer: 'return=minimal',
      body: { deleted: true, kg: null, updated_ms: Date.now() },
    });
  }
  if (p.meta) {
    const m = p.meta;
    await call('/rest/v1/profiles?on_conflict=user_id', {
      method: 'POST',
      token: t,
      prefer: UPSERT,
      body: { user_id: uid, profile: m.profile, goals: m.goals, prefs: { recent: m.recent, lastPortion: m.lastPortion }, name: m.name, updated_ms: m.updated_ms },
    });
  }
  if (p.library) {
    const { updated_ms, ...lib } = p.library;
    await call('/rest/v1/libraries?on_conflict=user_id', { method: 'POST', token: t, prefer: UPSERT, body: { user_id: uid, data: lib, updated_ms } });
  }
}

export type SyncBridge = {
  /** Past de app-state aan met de nieuwste versie (functionele update) en geeft het resultaat terug. */
  apply: <R>(f: (s: SyncState) => { state: SyncState; result: R }) => Promise<R>;
  read: () => Promise<SyncState>;
};

let running: Promise<void> | null = null;
let again = false;

/** Eén sync-ronde: eerst ophalen, dan versturen. Dubbele aanroepen worden samengevoegd. */
export function syncNow(bridge: SyncBridge): Promise<void> {
  if (!cloudConfigured) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    await loadCloud();
    if (!data.session) return;
    emit({ syncing: true });
    try {
      do {
        again = false;
        const s = await validSession();
        const { remote, cursor } = await pull(s);
        const snapBefore = data.snap;
        const nameBefore = data.name;
        const pulled = await bridge.apply((st) => {
          const r = applyPull(st, snapBefore, remote, nameBefore);
          return { state: r.changed ? r.state : st, result: r };
        });
        data = { ...data, snap: pulled.snap, name: pulled.name, cursor };
        await save();

        const state = await bridge.read();
        const plan = planPush(state, data.snap, data.name, Date.now());
        // Veiligheidsstop: de app verwijdert regels één voor één. Verdwijnt ineens het grootste deel,
        // dan is er iets mis (bijv. gegevens niet geladen) en sturen we geen verwijderingen.
        const known = Object.keys(data.snap.entries).length;
        if (plan.deleteEntries.length > 20 && plan.deleteEntries.length > known / 2) {
          throw new CloudError('Veiligheidsstop: de app wilde heel veel regels in de cloud verwijderen. Er is niets verwijderd.');
        }
        if (!isEmptyPlan(plan)) {
          await push(s, plan);
          data = { ...data, snap: afterPush(data.snap, plan) };
        }
        // Dagdoel voor vrienden: alleen versturen als het veranderd is en het profiel in de cloud staat.
        const target = targetOf(state);
        const th = target ? stableStringify(target) : '';
        if (target && th !== data.targetHash && data.snap.metaMs > 0) {
          await call(`/rest/v1/profiles?user_id=eq.${s.userId}`, { method: 'PATCH', token: s.accessToken, prefer: 'return=minimal', body: { target } });
          data = { ...data, targetHash: th };
        }
        data = { ...data, lastSync: new Date().toISOString() };
        await save();
        emit({ lastSync: data.lastSync, name: data.name, error: null });
      } while (again);
    } catch (e: any) {
      emit({ error: e instanceof CloudError ? e.message : `Synchroniseren lukte niet: ${e?.message ?? 'onbekende fout'}` });
    } finally {
      emit({ syncing: false });
      running = null;
    }
  })();
  return running;
}

/** Het dagdoel zoals de app het toont (kcal en macro's in gram, vezels). */
export function targetOf(st: SyncState): { kcal: number; e: number; k: number; v: number; fiber: number } | null {
  if (!st.profile) return null;
  const w = dailyWeights(st.weights);
  const weight = w.length ? w[w.length - 1].kg : 75;
  const kcal = computeGoal(st.profile, weight, st.goals).goal;
  const g = macroGrams(kcal, splitFor(st.goals));
  return { kcal: Math.round(kcal), e: Math.round(g.e), k: Math.round(g.k), v: Math.round(g.v), fiber: st.goals.fiberGoal || 30 };
}

// ---------- vrienden ----------
// Alles via databasefuncties (supabase/schema.sql, fase 3): die geven alleen terug wat de ander deelt.

export type Share = { totals: boolean; log: boolean; weight: boolean; goals: boolean; favorites: boolean };
export const SHARE_KEYS: (keyof Share)[] = ['totals', 'log', 'weight', 'goals', 'favorites'];
export type Target = { kcal: number; e: number; k: number; v: number; fiber: number };
export type Friend = { id: string; name: string; share: Partial<Share>; target: Target | null; since: string };
export type FriendDay = { date: string; kcal: number; e: number; k: number; v: number; fiber: number; items: number };
export type FriendEntry = { meal: string; name: string; brand: string | null; grams: number; unit: string; kcal: number; e: number; k: number; v: number };

function friendError(e: unknown): never {
  const m = e instanceof Error ? e.message : String(e);
  if (/code_not_found/.test(m)) throw new CloudError('Deze code bestaat niet. Kijk of je hem goed hebt overgenomen.');
  if (/own_code/.test(m)) throw new CloudError('Dit is je eigen code. Vraag je vriend om zijn code.');
  if (/not_signed_in/.test(m)) throw new CloudError('Je bent niet ingelogd.');
  if (/Could not find the function|PGRST202/.test(m)) throw new CloudError('De vriendenfunctie staat nog niet in de database.');
  throw e instanceof Error ? e : new CloudError(m);
}

async function rpc<R>(fn: string, body: Record<string, unknown> = {}): Promise<R> {
  const s = await validSession();
  try {
    return await call(`/rest/v1/rpc/${fn}`, { method: 'POST', token: s.accessToken, body });
  } catch (e) {
    friendError(e);
  }
}

/** Je eigen vriendcode en wat je deelt. */
export async function myFriendSettings(): Promise<{ code: string; share: Share }> {
  const s = await validSession();
  const rows: { invite_code: string; share: Partial<Share> | null }[] = await call(
    `/rest/v1/profiles?select=invite_code,share&user_id=eq.${s.userId}`,
    { token: s.accessToken },
  );
  if (!rows.length) throw new CloudError('Je profiel staat nog niet in de cloud. Synchroniseer eerst.');
  const sh = rows[0].share ?? {};
  return { code: rows[0].invite_code, share: { totals: sh.totals !== false, log: sh.log !== false, weight: sh.weight !== false, goals: sh.goals !== false, favorites: sh.favorites === true } };
}

export async function setShare(share: Share): Promise<void> {
  const s = await validSession();
  await call(`/rest/v1/profiles?user_id=eq.${s.userId}`, { method: 'PATCH', token: s.accessToken, prefer: 'return=minimal', body: { share } });
}

export const addFriend = (code: string) => rpc<{ id: string; name: string }>('add_friend', { code });
export const removeFriend = (id: string) => rpc<null>('remove_friend', { friend: id });
export const listFriends = () => rpc<Friend[]>('friends');
export const friendDays = (id: string, from: string, to: string) => rpc<FriendDay[]>('friend_days', { friend: id, d_from: from, d_to: to });
export const friendEntries = (id: string, date: string) => rpc<FriendEntry[]>('friend_entries', { friend: id, d: date });
export const friendWeights = (id: string, from: string) => rpc<{ date: string; kg: number }[]>('friend_weights', { friend: id, d_from: from });

export const friendFavorites = async (id: string): Promise<FriendFavorites> => parseFriendFavorites(await rpc<unknown>('friend_favorites', { friend: id }));

/** Leest of iemand iets deelt (ontbreekt = aan, behalve favorieten: die staan standaard uit). */
export const shares = (f: Friend, k: keyof Share) => (k === 'favorites' ? f.share[k] === true : f.share[k] !== false);

export function isSignedIn(): boolean {
  return !!data.session;
}
