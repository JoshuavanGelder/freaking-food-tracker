import { requireOptionalNativeModule } from 'expo-modules-core';

type BarcodePhotoModule = { readFromFile(uri: string): Promise<string | null> };

const Native = requireOptionalNativeModule<BarcodePhotoModule>('BarcodePhoto');

/** True als de native zxing-cpp-scanner in deze app zit. */
export const hasNativeReader = !!Native;

/** Leest een barcode uit een fotobestand (file://...). Geeft null als er niets gevonden is. */
export async function readBarcodeFromFile(uri: string): Promise<string | null> {
  if (!Native) return null;
  try {
    return (await Native.readFromFile(uri)) ?? null;
  } catch {
    return null;
  }
}
