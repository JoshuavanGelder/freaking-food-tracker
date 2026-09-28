// Test van de fotoscanner: maakt echte barcodes (met bwip-js) en leest ze terug.
// Draait in GitHub Actions (npm run test:scan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bwipjs from 'bwip-js';
import pngjs from 'pngjs';
import * as jpegNs from 'jpeg-js';
import { decodeRGBA, decodeJpegBase64, toGray, rotate90, decodeGray } from './photoscan.ts';
import { normalizeBarcode } from './off.ts';

const jpeg: any = (jpegNs as any).encode ? jpegNs : (jpegNs as any).default;
const bwip: any = (bwipjs as any).toBuffer ? bwipjs : (bwipjs as any).default;
const PNG: any = (pngjs as any).PNG;

async function render(bcid: string, text: string) {
  const png = await bwip.toBuffer({ bcid, text, scale: 3, height: 12, paddingwidth: 20, paddingheight: 20, backgroundcolor: 'FFFFFF' });
  const img = PNG.sync.read(png);
  return { data: new Uint8Array(img.data), width: img.width, height: img.height };
}

test('GS1 DataBar Expanded van het AH-gehakt', async () => {
  const img = await render('databarexpanded', '(01)08719587122211(17)260930(3103)000300');
  const text = decodeRGBA(img.data, img.width, img.height);
  console.log('DataBar Expanded gelezen als:', text);
  assert.ok(text);
  assert.equal(normalizeBarcode(text!), '8719587122211');
});

test('DataBar Expanded, 90 graden gedraaid', async () => {
  const img = await render('databarexpanded', '(01)08719587122211(17)260930');
  const gray = toGray(img.data, img.width, img.height);
  const text = decodeGray(rotate90(gray, img.width, img.height), img.height, img.width);
  console.log('Gedraaid gelezen als:', text);
  assert.equal(normalizeBarcode(text!), '8719587122211');
});

test('GS1 DataBar (omnidirectional)', async () => {
  const img = await render('databaromni', '(01)08719587122211');
  const text = decodeRGBA(img.data, img.width, img.height);
  console.log('DataBar Omni gelezen als:', text);
  assert.equal(normalizeBarcode(text!), '8719587122211');
});

test('gewone EAN-13 via JPEG', async () => {
  const img = await render('ean13', '871052297949');
  const enc = jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, 90);
  const text = decodeJpegBase64(Buffer.from(enc.data).toString('base64'));
  console.log('EAN-13 via JPEG gelezen als:', text);
  assert.equal(normalizeBarcode(text!), '8710522979495');
});
