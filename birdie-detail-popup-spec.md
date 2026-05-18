# Bird Detail Popup — Spec

Reference for the implementing agent. Describes the data plan, Worker integration points, and UI states. No code snippets except response contracts.

---

## Scope

A shared popup component that shows full details for a single bird species. Triggered from any detection card in the app. Pulls data from four public sources (iNaturalist, Wikipedia, GBIF, Xeno-canto), orchestrated server-side in the existing Cloudflare Worker, and returned to the client as a single normalized payload. Rarity is computed alongside detection so it can appear on the detection card itself, not only inside the popup.

---

## Architecture

Two integration points in the existing Worker.

1. **Detection pipeline (existing path).** Already calls external sources when a bird is identified. Add a rarity computation step here, gated on user position being available. Rarity is returned inline with the detection result so the detection card can render the indicator immediately.

2. **Popup details endpoint (new).** Single endpoint, single round-trip from the client. Orchestrates all remaining source calls in parallel, normalizes the response, returns one `BirdDetail` object. Client calls this when the popup opens.

Both paths share the same source clients, response normalizers, and caching layer inside the Worker. Rarity logic in particular must be one function reused in both paths.

---

## Inputs

**Per-species (resolve once, store in species catalog):**

| Field                       | Source for resolution        | Purpose                                            |
| --------------------------- | ---------------------------- | -------------------------------------------------- |
| `inat_taxon_id`             | one-time iNat taxa search    | Drives iNat calls                                  |
| `gbif_taxon_key`            | one-time GBIF species match  | Drives GBIF map tiles                              |
| `scientific_name`           | already known from detection | Drives Wikipedia and Xeno-canto                    |
| `wikipedia_title_by_locale` | optional precomputed map     | Optional speed-up; otherwise use `scientific_name` |

**Per-request (from app context):**

| Field        | Required | Effect when missing                                       |
| ------------ | -------- | --------------------------------------------------------- |
| `locale`     | no       | Default to `en`. Localized fields fall back to English.   |
| `lat`, `lng` | no       | Map block and rarity block are omitted from the response. |

The Worker must accept absent `locale` and absent position without erroring.

---

## Localization

| Source                              | Supports locale | How                                                                     |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------- |
| Wikipedia REST `/page/summary/`     | yes             | Subdomain swap: `{locale}.wikipedia.org`                                |
| Wikipedia Action API (`/w/api.php`) | yes             | Subdomain swap: `{locale}.wikipedia.org`                                |
| iNaturalist `/v1/taxa/{id}`         | yes             | `locale` query param (e.g. `locale=it`) affects `preferred_common_name` |
| iNaturalist `/v1/observations`      | partial         | Not needed for visible fields                                           |
| GBIF                                | no              | N/A                                                                     |
| Xeno-canto                          | no              | N/A                                                                     |

**Fallback rules:**

1. If a localized Wikipedia article does not exist for `scientific_name`, fall back to English.
2. If `preferred_common_name` is null in the requested locale, fall back to scientific name.
3. Long description from Wikipedia Action API may return empty (`extract` missing). If so, fall back to iNat `wikipedia_summary` (English HTML) and surface that.

---

## Position-conditional behavior

When `lat` and `lng` are absent:

- Omit `rarity` field from both detection response and popup response.
- Omit `map` field from popup response.
- Client hides the rarity chip on detection cards and hides the map section of the popup.
- All other sections render normally.

When `lat` and `lng` are present:

- Detection response includes `rarity` tier.
- Popup response includes `rarity` (full detail) and `map` data.

---

## Rarity

### Computation

Single iNat `/observations` call with `taxon_id`, `lat`, `lng`, `radius=50`, `d1` set to 90 days ago. `total_results` is the local count signal. Same call also provides recent observations used for map pins and "last seen near you" data, so it serves two purposes.

### Tiers

| Tier code     | Local count (90d, 50km) | Suggested label key  | Indicator color (Tailwind family) |
| ------------- | ----------------------- | -------------------- | --------------------------------- |
| `legendary`   | 0                       | `rarity.legendary`   | indigo                            |
| `rare`        | 1–5                     | `rarity.rare`        | amber                             |
| `uncommon`    | 6–30                    | `rarity.uncommon`    | sky                               |
| `common`      | 31–150                  | `rarity.common`      | teal                              |
| `very_common` | > 150                   | `rarity.very_common` | gray                              |

Thresholds are a first guess. Make them tunable via a config constant in the Worker so they can be adjusted after seeing real numbers for the Cesena region.

### Display surfaces

| Surface        | Element                                                                                                       | Behavior                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Detection card | Small colored circle/dot, no text                                                                             | Color from tier table above. Hidden when no position available. |
| Popup hero     | Full chip: colored dot + localized label + secondary info ("Visto N volte negli ultimi 90 giorni entro 50km") | Hidden when no position available.                              |

The detection card indicator and the popup chip must derive from the same `tier` value, computed once per request.

---

## Worker endpoint surface

### 1. Detection pipeline (modify existing)

Add a rarity computation step after bird identification, parallel to the other external calls already happening there. Skip the step when `lat`/`lng` are not in the request context. Attach `rarity: { tier, localCount90d }` to the detection response payload.

### 2. Popup details endpoint (new)

One endpoint. One client call per popup open. Accepts the per-request inputs above plus the per-species IDs (or just the species code, with the Worker doing the catalog lookup). Returns the `BirdDetail` contract below.

Internally orchestrates these calls in parallel:

| Call                                                                             | Purpose                                     | Required position? | Required locale? |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------ | ---------------- |
| iNat `/v1/taxa/{inat_taxon_id}?locale={locale}`                                  | Taxonomy, photo, conservation, common name  | no                 | uses if present  |
| iNat `/v1/observations?taxon_id&lat&lng&radius=50&d1=90d&per_page=50&order=desc` | Rarity + map pins + last-seen               | yes                | no               |
| Wikipedia REST `/page/summary/{title}` on `{locale}.wikipedia.org`               | Short tagline + thumbnail + canonical URL   | no                 | uses if present  |
| Wikipedia Action API extracts on `{locale}.wikipedia.org`                        | Full description (lead section, plain text) | no                 | uses if present  |
| Xeno-canto `/api/3/recordings?query=sp:"…"+q:A&per_page=50&key=…`                | Audio recordings                            | no                 | no               |
| GBIF density tile URL template (not a fetch, just a URL builder)                 | Global heatmap                              | no                 | no               |

The Worker must:

- Run all calls in parallel.
- Tolerate any single call failing without failing the whole response (return the field as null/empty).
- Apply per-source cache TTLs (see Sources catalog below).
- Strip raw source fields the client doesn't need; return only the normalized contract.

---

## Sources catalog

| Tag         | Base URL                                                        | Auth                    | Polite rate               | Cache TTL                         |
| ----------- | --------------------------------------------------------------- | ----------------------- | ------------------------- | --------------------------------- |
| INAT        | `https://api.inaturalist.org/v1`                                | none                    | ~1 req/s, 10k/day         | 24h for taxa; 1h for observations |
| WIKI_REST   | `https://{locale}.wikipedia.org/api/rest_v1`                    | none                    | 200/s                     | 24h                               |
| WIKI_ACTION | `https://{locale}.wikipedia.org/w/api.php`                      | none                    | be polite, set User-Agent | 24h                               |
| GBIF        | `https://api.gbif.org` (`/v1` for species, `/v2` for map tiles) | none                    | generous                  | 7d                                |
| XC          | `https://xeno-canto.org/api/3`                                  | API key (Worker secret) | 1 req/s                   | 24h                               |

User-Agent header required on Wikipedia calls. Set a single identifying UA per the Worker's config.

---

## Field-to-source map

### Hero block

| Field                   | Source                        | JSON path                                                             |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `heroPhoto.url`         | INAT taxa                     | `results[0].default_photo.medium_url` (or `.original.url` for larger) |
| `heroPhoto.attribution` | INAT taxa                     | `results[0].default_photo.attribution`                                |
| `heroPhoto.license`     | INAT taxa                     | `results[0].default_photo.license_code`                               |
| `gallery[]`             | INAT taxa                     | `results[0].taxon_photos[].photo`                                     |
| `commonName`            | INAT taxa with `locale` param | `results[0].preferred_common_name`                                    |
| `scientificName`        | INAT taxa                     | `results[0].name`                                                     |
| `rarity.tier`           | computed                      | see Rarity section                                                    |

### Description block

| Field                     | Source               | JSON path / notes                                                                                    |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `taglineShort`            | WIKI_REST summary    | `extract` (one sentence)                                                                             |
| `descriptionLong`         | WIKI_ACTION extracts | First value of `query.pages.{pageid}.extract` (multi-paragraph plain text, paragraphs split by `\n`) |
| `descriptionLongFallback` | INAT taxa            | `results[0].wikipedia_summary` (English HTML, use only if `descriptionLong` is empty)                |
| `wikipediaUrl`            | WIKI_REST summary    | `content_urls.desktop.page`                                                                          |

### Map block (position-required)

| Field                       | Source            | JSON path / notes                                                                                                  |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `map.globalTileUrlTemplate` | GBIF v2 map       | URL template with `{z}/{x}/{y}` placeholders, `taxonKey` baked in, style `purpleHeat.point` (or design preference) |
| `map.nearbyPins[]`          | INAT observations | `results[].geojson.coordinates` (note `[lng, lat]` order), `observed_on`, `place_guess`, `photos[0].url`           |
| `map.lastSeenNearby`        | INAT observations | First item of sorted results: date, place, distance computed client-side                                           |

### Sounds block

Fetch 50 from XC with quality A. Server-side, dedupe and select up to 10 with a spread across `type` values. Type priority for selection: `song` > `call` > `flight call` > `alarm call` > `begging call` > others. Treat comma-separated `type` strings as multi-tagged.

| Per-recording field | JSON path                                     |
| ------------------- | --------------------------------------------- |
| `id`                | `recordings[i].id`                            |
| `audioUrl`          | `recordings[i].file` (absolute https in v3)   |
| `spectrogramUrl`    | `recordings[i].sono.med`                      |
| `types[]`           | `recordings[i].type` split on `,` and trimmed |
| `lengthSeconds`     | parsed from `recordings[i].length` (`"M:SS"`) |
| `country`           | `recordings[i].cnt`                           |
| `location`          | `recordings[i].loc`                           |
| `recordist`         | `recordings[i].rec`                           |
| `license`           | `recordings[i].lic` (URL)                     |
| `date`              | `recordings[i].date` (ISO date)               |

### Taxonomy and conservation block

| Field        | Source    | JSON path / notes                                                                                                            |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `family`     | INAT taxa | `results[0].ancestors[]` where `rank === 'family'`, take `name`                                                              |
| `order`      | INAT taxa | `results[0].ancestors[]` where `rank === 'order'`, take `name`                                                               |
| `class`      | INAT taxa | `results[0].ancestors[]` where `rank === 'class'`, take `name`                                                               |
| `native`     | INAT taxa | `results[0].native`                                                                                                          |
| `introduced` | INAT taxa | `results[0].introduced`                                                                                                      |
| `endemic`    | INAT taxa | `results[0].endemic`                                                                                                         |
| `threatened` | INAT taxa | `results[0].threatened`                                                                                                      |
| `iucnStatus` | INAT taxa | `results[0].conservation_statuses[]` filter `place_id == null`, take status (`LC`, `NT`, `VU`, `EN`, `CR`, `EW`, `EX`, `DD`) |

### Stats block

| Field                     | Source      | JSON path                       |
| ------------------------- | ----------- | ------------------------------- |
| `globalObservationsCount` | INAT taxa   | `results[0].observations_count` |
| `recordingsAvailable`     | XC response | `numRecordings`                 |

User's personal stats (first/last/total spotted) come from the app's own DB, not from these sources.

---

## Response contract (Worker → client)

The shape returned by the popup details endpoint. Use as the source of truth for the client component.

```ts
type RarityTier = 'legendary' | 'rare' | 'uncommon' | 'common' | 'very_common';
type IucnStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD';

interface BirdDetail {
	identity: {
		inatTaxonId: number;
		gbifTaxonKey: number;
		scientificName: string;
		commonName: string | null; // localized; null if no localized name found
		family: string | null;
		order: string | null;
		class: string | null;
	};

	media: {
		heroPhoto: {
			url: string;
			attribution: string;
			license: string;
		} | null;
		gallery: Array<{ url: string; attribution: string; license: string }>;
	};

	description: {
		taglineShort: string | null;
		descriptionLong: string | null; // paragraphs split by '\n'
		descriptionIsFallback: boolean; // true when sourced from iNat English fallback
		wikipediaUrl: string | null;
	};

	conservation: {
		iucnStatus: IucnStatus | null;
		native: boolean | null;
		introduced: boolean | null;
		endemic: boolean | null;
		threatened: boolean | null;
	};

	stats: {
		globalObservationsCount: number | null;
		recordingsAvailable: number | null;
	};

	recordings: Array<{
		id: string;
		audioUrl: string;
		spectrogramUrl: string | null;
		types: string[];
		lengthSeconds: number | null;
		country: string | null;
		location: string | null;
		recordist: string;
		license: string;
		date: string | null;
	}>;

	// Position-conditional. Both null when lat/lng absent.
	rarity: {
		tier: RarityTier;
		localCount90d: number;
		lastSeenNearby: {
			date: string; // ISO
			placeName: string | null;
			distanceKm: number;
		} | null;
	} | null;

	map: {
		globalTileUrlTemplate: string; // contains {z}/{x}/{y}
		nearbyPins: Array<{
			lat: number;
			lng: number;
			date: string;
			placeName: string | null;
			photoUrl: string | null;
		}>;
	} | null;
}
```

The detection pipeline response gets only `rarity` added to it (same shape as `BirdDetail.rarity`), not the full object.

---

## Loading and empty states

### Loading

The popup makes one call. While that call is in flight:

- Whole popup shows a skeleton with placeholder shapes for hero photo, two text lines, map area, and sound rows.
- Detection card chip: while the detection pipeline is still computing rarity, the chip slot should be empty (no placeholder dot), to avoid flicker. Render the dot only once the tier is known.

### Empty (per-section, applies after data has loaded)

| Section                      | Condition for hiding                          | What to show instead                                                                  |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hero photo                   | `media.heroPhoto` null                        | Generic species silhouette or solid color block                                       |
| Long description             | both `descriptionLong` null and fallback null | Show only `taglineShort`, hide the "read more" link                                   |
| Tagline                      | `taglineShort` null                           | Hide the line, don't show empty space                                                 |
| Conservation chip            | all conservation fields null                  | Hide the entire chip                                                                  |
| Map                          | `map` null (no position)                      | Hide entire map block                                                                 |
| Rarity chip in popup         | `rarity` null (no position)                   | Hide chip                                                                             |
| Rarity dot on detection card | rarity absent on detection record             | Hide dot                                                                              |
| Sounds                       | `recordings` empty array                      | Show one-line message keyed `sounds.empty` (e.g. "Nessuna registrazione disponibile") |
| Gallery                      | `media.gallery` empty                         | Show only hero photo, no thumbnail strip                                              |
| Stats                        | a given stat null                             | Hide that one row, keep the others                                                    |

Empty handling is per-section because any single source can fail or return nothing without the rest being affected. Do not hide the whole popup if one source fails.

---

## Shared popup component

A single component used from three surfaces:

1. Home screen detection card
2. Journal — Sessions page
3. Journal — Life-list page

**Trigger:** tap/click on a detection card on any of these surfaces opens the popup with the species in focus.

**Props the component needs:**

| Prop                 | Required | Source                                               |
| -------------------- | -------- | ---------------------------------------------------- |
| `inatTaxonId`        | yes      | Species catalog (resolved via species code)          |
| `gbifTaxonKey`       | yes      | Species catalog                                      |
| `scientificName`     | yes      | Detection / catalog                                  |
| `userLocale`         | no       | App settings                                         |
| `userLat`, `userLng` | no       | Device location, if granted and recent               |
| `personalStats`      | no       | App DB (for the user's own first/last/total spotted) |

**Behavior:**

- On open, the component triggers the popup details endpoint with the props above as the request payload.
- The popup is self-contained for its data fetch; the calling surface does not need to prefetch.
- The same component handles loading skeleton and per-section empty states as specified above.
- Closing the popup cancels any in-flight request.

---

## Additional Features

- Per-region IUCN status (e.g. status in Italy specifically). iNat returns regional statuses in `conservation_statuses` with a `place_id`.
- Subspecies handling. iNat ancestry has them; render only if user opts in.
- Personal stats integration (first spotted, last spotted, total times). Comes from app DB.
