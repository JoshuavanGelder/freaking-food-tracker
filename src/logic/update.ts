// Update-melding: vergelijkt het buildnummer van de app met de nieuwste GitHub-release.
// Pure functies zonder runtime-imports (zie CLAUDE.md), getest in update.test.ts.

export const RELEASES_URL = 'https://api.github.com/repos/JoshuavanGelder/freaking-food-tracker/releases/latest';
/** Hoe vaak we hooguit bij GitHub kijken (de openbare API staat 60 aanvragen per uur per IP toe). */
export const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

export type ReleaseInfo = { build: number; name: string; notes: string; apkUrl: string; pageUrl: string };

/** "build-42" → 42; alles anders → null. */
export function parseBuild(tag: unknown): number | null {
  if (typeof tag !== 'string') return null;
  const m = /^build-(\d{1,9})$/.exec(tag.trim());
  return m ? Number(m[1]) : null;
}

/** Haalt uit het antwoord van GitHub (`releases/latest`) wat we nodig hebben; null als het onbruikbaar is. */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, any>;
  const build = parseBuild(r.tag_name);
  if (build == null || r.draft === true || r.prerelease === true) return null;
  const assets: any[] = Array.isArray(r.assets) ? r.assets : [];
  const apk = assets.find((a) => a && typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string');
  if (!apk) return null;
  const url = String(apk.browser_download_url);
  // Alleen downloaden van GitHub zelf.
  if (!/^https:\/\/github\.com\//.test(url)) return null;
  return {
    build,
    name: typeof r.name === 'string' ? r.name : `Versie ${build}`,
    notes: typeof r.body === 'string' ? cleanNotes(r.body) : '',
    apkUrl: url,
    pageUrl: typeof r.html_url === 'string' && /^https:\/\/github\.com\//.test(r.html_url) ? r.html_url : url,
  };
}

/** Releasetekst compact: de vaste installatie-uitleg en de commit-regel eruit, max. 280 tekens. */
export function cleanNotes(body: string): string {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Commit:/i.test(l) && !/^Open dit op je Android/i.test(l) && !/^Nieuwe versie van/i.test(l));
  const text = lines.join('\n');
  return text.length > 280 ? text.slice(0, 277) + '…' : text;
}

/** Is er een nieuwere build dan de huidige? `dismissed` = het buildnummer dat je al hebt weggeklikt. */
export function updateToShow(current: number, release: ReleaseInfo | null, dismissed: number): ReleaseInfo | null {
  if (!release) return null;
  if (!(current >= 0)) return null;
  if (release.build <= current) return null;
  if (release.build <= dismissed) return null;
  return release;
}

/** Moet er nu gecontroleerd worden? */
export function shouldCheck(now: number, lastCheck: number, force = false): boolean {
  return force || !(lastCheck > 0) || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck;
}
