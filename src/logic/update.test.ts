import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_EVERY_MS, cleanNotes, parseBuild, parseRelease, shouldCheck, updateToShow } from './update.ts';

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'build-42',
  name: 'Freaking Food Tracker 42',
  body: 'Nieuwe versie van Freaking Food Tracker.\nOpen dit op je Android-telefoon, tik op het .apk-bestand hieronder en installeer het.\nCommit: abc123',
  html_url: 'https://github.com/JoshuavanGelder/freaking-food-tracker/releases/tag/build-42',
  assets: [
    {
      name: 'freaking-food-tracker-42.apk',
      browser_download_url: 'https://github.com/JoshuavanGelder/freaking-food-tracker/releases/download/build-42/freaking-food-tracker-42.apk',
    },
  ],
  ...over,
});

test('buildnummer uit de tag', () => {
  assert.equal(parseBuild('build-42'), 42);
  assert.equal(parseBuild(' build-7 '), 7);
  assert.equal(parseBuild('v1.2.3'), null);
  assert.equal(parseBuild('build-'), null);
  assert.equal(parseBuild(undefined), null);
});

test('release uitlezen', () => {
  const r = parseRelease(release());
  assert.equal(r?.build, 42);
  assert.match(r!.apkUrl, /freaking-food-tracker-42\.apk$/);
  assert.equal(r?.notes, '');
});

test('onbruikbare releases geven null', () => {
  assert.equal(parseRelease(null), null);
  assert.equal(parseRelease({ message: 'Not Found' }), null);
  assert.equal(parseRelease(release({ draft: true })), null);
  assert.equal(parseRelease(release({ prerelease: true })), null);
  assert.equal(parseRelease(release({ assets: [] })), null);
  // downloadlink buiten GitHub wordt nooit gebruikt
  assert.equal(parseRelease(release({ assets: [{ name: 'a.apk', browser_download_url: 'https://evil.example/a.apk' }] })), null);
});

test('releasetekst: vaste uitleg eruit, lang afkappen', () => {
  assert.equal(cleanNotes('Eigen regel\nCommit: abc'), 'Eigen regel');
  assert.ok(cleanNotes('x'.repeat(500)).length <= 280);
});

test('wanneer tonen we een update', () => {
  const r = parseRelease(release())!;
  assert.equal(updateToShow(41, r, 0)?.build, 42);
  assert.equal(updateToShow(42, r, 0), null); // al up-to-date
  assert.equal(updateToShow(43, r, 0), null);
  assert.equal(updateToShow(41, r, 42), null); // weggeklikt
  assert.equal(updateToShow(41, null, 0), null);
  assert.equal(updateToShow(41, r, 40)?.build, 42); // nieuwere build dan weggeklikt
});

test('controleren hooguit om de paar uur', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldCheck(now, 0), true);
  assert.equal(shouldCheck(now, now - 1000), false);
  assert.equal(shouldCheck(now, now - CHECK_EVERY_MS), true);
  assert.equal(shouldCheck(now, now - 1000, true), true);
  assert.equal(shouldCheck(now, now + 5000), true); // klok liep terug
});
