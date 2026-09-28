package expo.modules.barcodephoto

import android.graphics.BitmapFactory
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import zxingcpp.BarcodeReader

/**
 * Leest een barcode uit een fotobestand met zxing-cpp.
 * Ondersteunt o.a. EAN, Code 128, QR, DataMatrix en GS1 DataBar (ook Expanded).
 */
class BarcodePhotoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BarcodePhoto")

    AsyncFunction("readFromFile") { uri: String ->
      val path = if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri

      // Eerst alleen de afmetingen, dan zo nodig verkleind inlezen (scheelt geheugen).
      val bounds = BitmapFactory.Options()
      bounds.inJustDecodeBounds = true
      BitmapFactory.decodeFile(path, bounds)
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2600) sample *= 2

      val opts = BitmapFactory.Options()
      opts.inSampleSize = sample
      val bitmap = BitmapFactory.decodeFile(path, opts) ?: return@AsyncFunction null

      try {
        val results = BarcodeReader().read(bitmap)
        results.firstOrNull { !it.text.isNullOrEmpty() }?.text
      } finally {
        bitmap.recycle()
      }
    }
  }
}
