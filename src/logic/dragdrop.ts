/** Een plek op het scherm waar je iets op los kunt laten (hoogte in schermcoördinaten). */
export type DropZone = { id: string; top: number; bottom: number };

/**
 * Welke zone ligt onder punt y? Tussen twee zones in (de ruimte tussen de kaarten) pakt de dichtstbijzijnde,
 * zodat loslaten net naast een kaart niet mislukt. Ver buiten alle zones (meer dan `slack`) = geen zone.
 */
export function zoneAt(zones: DropZone[], y: number, slack = 24): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    const dist = y < z.top ? z.top - y : y > z.bottom ? y - z.bottom : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = z.id;
    }
  }
  return bestDist <= slack ? best : null;
}
