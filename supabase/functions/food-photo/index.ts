// Edge Function "food-photo": herkent eten op een foto of in een beschrijving ("2 kiwi's en een banaan")
// met Google Gemini (gratis laag van Google AI Studio).
//
// De app stuurt { image?: <base64-JPEG>, hint?: string } met de sessie van de gebruiker (Authorization: Bearer ...)
// en de publishable key (apikey). Zonder foto is `hint` de beschrijving. De functie:
//   1. telt de aanvraag in de database via rpc use_photo() — dat werkt alleen met een geldige login, dus dit is ook
//      de logincontrole — en weigert boven de daglimiet (foto's en beschrijvingen samen);
//   2. vraagt Gemini om een lijst onderdelen met (geschatte) grammen (vast JSON-schema);
//   3. geeft die lijst terug. De foto wordt nergens bewaard.
//
// Instellingen (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY      verplicht, sleutel uit Google AI Studio (nooit in de app of de repo)
//   GEMINI_MODELS       optioneel, modellen in volgorde van voorkeur, komma-gescheiden
//   PHOTO_DAILY_LIMIT   optioneel, AI-aanvragen (foto + tekst) per gebruiker per dag (standaard 25)
//
// Uitrollen zonder JWT-controle door de gateway (verify_jwt = false): de functie controleert de login zelf via use_photo().

const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'];
const MAX_IMAGE_CHARS = 6_000_000; // ~4,5 MB als JPEG; de app stuurt ~150 kB

const FIELDS = `Per onderdeel:
- naam: korte Nederlandse naam zoals een Nederlander het noemt, enkelvoud, zonder aantal, bijv. "Kipfilet", "Witte rijst", "Kiwi", "Pindasaus".
- zoekterm: 1 tot 4 woorden in de stijl van het Nederlandse voedingsstoffenbestand NEVO: eerst het basisproduct, dan de soort,
  dan de bereiding. Zet "gekookt", "gebakken" of "bereid" erbij als het klaargemaakt is; "light" of "zero" alleen als je dat ziet.
  Voorbeelden: "rijst witte gekookt", "kipfilet bereid", "broccoli gekookt", "aardappelen gekookt", "pasta witte gekookt",
  "saus sate kant-en-klaar", "tarwebrood volkoren", "melk halfvolle", "koffie bereid", "thee bereid", "frites bereid",
  "zalm bereid", "ei gekookt", "kaas 48+ belegen", "appel", "frisdrank cola".
- GRAM_REGEL
- portie: hoe de hoeveelheid in gewone woorden heet, bijv. "2 stuks", "1 bord", "1 glas", "2 sneetjes", "1 eetlepel", of een lege tekst.
- eenheid: "g" of "ml".
- zekerheid: "hoog", "midden" of "laag" over de hoeveelheid.
- kcal, eiwit, koolhydraten, vet: jouw schatting per 100 g (of 100 ml), alleen als reserve.

Verder:
- titel: korte naam voor de hele maaltijd, bijv. "Rijst met kip en broccoli" of "Kiwi's en banaan".
- verborgen_vet: true als er waarschijnlijk olie, boter of vet is gebruikt dat niet genoemd of te zien is (bakken, roerbakken, dressing).
- opmerking: hooguit één korte zin in het Nederlands met iets wat de gebruiker moet nakijken, of een lege tekst.`;

const PHOTO_PROMPT = `Je bent de voedingsassistent van een Nederlandse calorie-app. Bekijk de foto van een maaltijd, snack of drankje.
Noem elk los eetbaar onderdeel dat je ziet (maximaal 8). Voeg niets toe wat je niet ziet, behalve wat de hint van de gebruiker noemt.

${FIELDS.replace('GRAM_REGEL', 'gram: geschatte hoeveelheid die op de foto te zien is, in gram (dranken in ml). Gebruik bord (meestal 26 cm), bestek, glas of hand als maat.')}
Is er geen eten of drinken te zien, geef dan een lege lijst en zeg dat in opmerking.
Hoeveelheden of producten in de hint van de gebruiker gaan altijd voor op wat je zelf schat.`;

const TEXT_PROMPT = `Je bent de voedingsassistent van een Nederlandse calorie-app. De gebruiker beschrijft in eigen woorden wat hij at of dronk,
bijvoorbeeld "2 kiwi's en een banaan" of "bord spaghetti bolognese en een glas cola". Maak daar een lijst van (maximaal 10 onderdelen).
Neem alleen op wat de gebruiker noemt; voeg geen bijgerechten toe die er niet staan. Een samengesteld gerecht (stamppot, lasagne,
pizza, soep) mag één onderdeel zijn als dat in NEVO voorkomt; anders splits je het in de hoofdingrediënten.
Dezelfde soort met een aantal ("2 kiwi's") is één onderdeel met het totaal aantal gram.

${FIELDS.replace('GRAM_REGEL', 'gram: totale hoeveelheid in gram (dranken in ml). Noemt de gebruiker gram of ml, neem die over. Noemt hij stuks of porties, reken om met gangbare Nederlandse gewichten van het eetbare deel, bijv. 1 kiwi 75 g, 1 banaan 120 g, 1 appel 150 g, 1 ei 55 g, 1 snee brood 35 g, 1 beschuit 10 g, 1 plak kaas 20 g, 1 bord pasta of rijst 200 g, 1 glas 200 ml, 1 kopje 125 ml, 1 mok 250 ml, 1 eetlepel 15 g, 1 theelepel 5 g. Geen hoeveelheid genoemd: neem een gewone portie.')}
zekerheid is "hoog" als de gebruiker de hoeveelheid in gram of ml noemt, "midden" bij stuks of porties, "laag" als er geen hoeveelheid staat.
Staat er geen eten of drinken in de tekst, geef dan een lege lijst en zeg dat in opmerking.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: { type: 'STRING' },
    onderdelen: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          naam: { type: 'STRING' },
          zoekterm: { type: 'STRING' },
          gram: { type: 'NUMBER' },
          portie: { type: 'STRING' },
          eenheid: { type: 'STRING', enum: ['g', 'ml'] },
          zekerheid: { type: 'STRING', enum: ['hoog', 'midden', 'laag'] },
          kcal: { type: 'NUMBER' },
          eiwit: { type: 'NUMBER' },
          koolhydraten: { type: 'NUMBER' },
          vet: { type: 'NUMBER' },
        },
        required: ['naam', 'zoekterm', 'gram', 'eenheid', 'zekerheid', 'kcal', 'eiwit', 'koolhydraten', 'vet'],
      },
    },
    verborgen_vet: { type: 'BOOLEAN' },
    opmerking: { type: 'STRING' },
  },
  required: ['titel', 'onderdelen', 'verborgen_vet', 'opmerking'],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Telt deze foto voor de ingelogde gebruiker; geeft het aantal van vandaag terug, of null als de login niet klopt. */
async function countPhoto(req: Request): Promise<{ count: number } | { error: Response }> {
  const auth = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!auth.startsWith('Bearer ')) return { error: json(401, { error: 'not_signed_in', message: 'Log in om foto’s te laten herkennen.' }) };
  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const res = await fetch(`${url}/rest/v1/rpc/use_photo`, {
    method: 'POST',
    headers: { apikey, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || /not_signed_in/.test(text)) {
    return { error: json(401, { error: 'not_signed_in', message: 'Je bent uitgelogd. Log opnieuw in.' }) };
  }
  if (res.status === 404 || /PGRST202|Could not find the function/.test(text)) {
    return { error: json(503, { error: 'no_database', message: 'Fotoherkenning staat nog niet in de database (SQL voor photo_usage ontbreekt).' }) };
  }
  if (!res.ok) return { error: json(502, { error: 'database', message: `Database gaf een fout (${res.status}).` }) };
  const n = Number(JSON.parse(text));
  return { count: Number.isFinite(n) ? n : 0 };
}

type Gemini = { ok: true; data: unknown; model: string } | { ok: false; status: number; message: string };

async function askGemini(key: string, models: string[], image: string, hint: string): Promise<Gemini> {
  const parts = image
    ? [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: hint ? `${PHOTO_PROMPT}\n\nHint van de gebruiker: ${hint}` : PHOTO_PROMPT }]
    : [{ text: `${TEXT_PROMPT}\n\nBeschrijving van de gebruiker: ${hint}` }];
  let last: Gemini = { ok: false, status: 502, message: 'Geen model beschikbaar.' };
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      }),
    });
    const body = await res.text();
    if (res.ok) {
      try {
        const b = JSON.parse(body);
        const out: string = (b?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
        const clean = out.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        return { ok: true, data: JSON.parse(clean), model };
      } catch {
        last = { ok: false, status: 502, message: 'De AI gaf een onleesbaar antwoord. Probeer het opnieuw.' };
        continue;
      }
    }
    console.log(`gemini ${model}: ${res.status} ${body.slice(0, 300)}`);
    // Model bestaat niet (meer), is niet gratis of zit aan zijn limiet: probeer het volgende.
    if (res.status === 404 || res.status === 429 || res.status === 400 || res.status === 403 || res.status >= 500) {
      last =
        res.status === 429
          ? { ok: false, status: 429, message: 'De gratis AI-limiet is even bereikt. Probeer het over een paar minuten opnieuw.' }
          : res.status === 400 && /API key/i.test(body)
            ? { ok: false, status: 500, message: 'De AI-sleutel klopt niet (GEMINI_API_KEY).' }
            : { ok: false, status: 502, message: `De AI gaf een fout (${res.status}).` };
      continue;
    }
    return { ok: false, status: 502, message: `De AI gaf een fout (${res.status}).` };
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method', message: 'Alleen POST.' });

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(503, { error: 'no_key', message: 'Fotoherkenning is nog niet ingesteld (GEMINI_API_KEY ontbreekt).' });

  let body: { image?: unknown; hint?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Ongeldig verzoek.' });
  }
  const image = typeof body.image === 'string' ? body.image.replace(/^data:image\/\w+;base64,/, '') : '';
  const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 500) : '';
  if (!image && hint.length < 2) {
    return json(400, { error: 'empty', message: 'Maak een foto of beschrijf wat je at.' });
  }
  if (image && (image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 2000)))) {
    return json(400, { error: 'bad_image', message: 'De foto kwam niet goed aan. Probeer het opnieuw.' });
  }

  const counted = await countPhoto(req);
  if ('error' in counted) return counted.error;
  const limit = Number(Deno.env.get('PHOTO_DAILY_LIMIT') ?? 25) || 25;
  if (counted.count > limit) {
    return json(429, { error: 'limit', message: `Je hebt de AI vandaag al ${limit} keer gebruikt. Morgen kan het weer; zoeken en scannen werken gewoon.` });
  }

  const models = (Deno.env.get('GEMINI_MODELS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ai = await askGemini(key, models.length ? models : DEFAULT_MODELS, image, hint);
  if (!ai.ok) return json(ai.status, { error: 'ai', message: ai.message });

  return json(200, { result: ai.data, model: ai.model, used: counted.count, limit });
});
