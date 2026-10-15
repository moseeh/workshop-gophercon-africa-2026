# Field Atlas: design

An antique explorer's globe on a dark walnut desk. The home page is the globe, full screen, with the
Logbook (every sighting as a ledger row) below it. "Field Atlas" is a working name: change
`layout.SiteName` and `web/assets/manifest.json` together.

## Colours (`web/assets/css/app.css`, `:root`)

| Token | Hex | Used for |
|---|---|---|
| `--walnut` | `#2A1E14` | the desk: page background, `theme-color` |
| `--walnut-deep` / `--walnut-light` | `#1B130C` / `#3A2A1C` | wood grain and shading |
| `--parchment` | `#F1E4C3` | land, field-guide pages, the Logbook, text on walnut |
| `--aged-paper` | `#E2CFA0` | inner coast tint, photo corners, soft text on walnut |
| `--sea` | `#8FA9A3` | the oceans |
| `--ink` | `#3B2A1A` | text on parchment, coastlines |
| `--sepia` | `#7A5230` | secondary text on parchment, graticule, borders |
| `--brass` / `--brass-light` | `#B08D57` / `#D9B97A` | the meridian ring, controls, labels on walnut. Never text on parchment. |
| `--red-ink` | `#9E2B25` | pins, the equator, lightning, the wax-seal play button, focus on parchment |

## Lettering

- Titles: **IM Fell English**, engraved-map style (`--font-title`).
- Text: **Merriweather** (`--font-body`).
- Handwriting: **Caveat** (`--font-hand`), only for observers' remarks, hints and small annotations.

## Pieces

- **Globe** (`web/assets/js/scenes/globe.js`): painted in code from Natural Earth (world-atlas
  110m, via jsDelivr) as sea-green water with waterlines, parchment land, dotted borders, an inked
  coast, a red dashed equator and paper grain. The brass ring around it is CSS, sized from the camera.
  It opens facing Nairobi.
- **Pins**: one `THREE.Points` with a shader for red-ink map tacks. New arrivals ripple, and the
  chosen pin gets a brass ring.
- **Voyage**: plays 2010 onwards (the lone 1948 record is left out) by exact timestamp, at about
  45 days a second, hurrying through empty stretches and capped at 4 arrivals a second per 1× speed.
  The bars on the timeline are sightings per month. "Follow the voyage" turns the globe towards
  new arrivals only when they're out of view.
- **Weather**: each arrival blooms with a painted wash: cloud (sepia watercolour), sun (inked),
  rain (hatching), snow (gouache specks), storm (dark wash + red-ink lightning), haze (wavy strokes).
  Always labelled "Estimated for that hour": the mock API invents it.
- **Field guide** (`components.FieldGuide`, served at `GET /sightings/{id}/guide`): fetched only
  when a pin is opened, so no photo loads until then. iNaturalist photos use `medium`, not
  `original`. Photo with paper corners, remarks in handwriting only when present, weather block,
  recorded by, link to the original record. A side page on desktop, a bottom sheet on phones.
- **Cartouche** (left side): a parchment `<details>` legend with brass double rule, how-to lines
  and inked weather symbols matching the globe's washes. Open on wide screens, folded to a
  "❦ Legend" pill below 1100px, and the visitor's choice is remembered in `localStorage`. It fades
  while the voyage plays. The wax seal pulses five times until the visitor plays or drags.
- **Zoom and clusters**: tacks stay a fixed size on screen and the camera comes down to 1.06
  (soft, painterly coastlines up close, by choice). Tacks closer than ~26px gather under a
  numbered red wax seal, and seals closer than 36px merge, recomputed when the camera moves. Off while
  the voyage plays. Tapping a seal opens its list.
- **Animal groups** (`species.Species.Group()`, `internal/domain/species/group.go`): family →
  everyday group, with genus exceptions (orca → Whales, wildebeest/buffalo split from antelope).
  The cartouche's **Animals** tab filters by group and by "✎ With notes". Filters also shape the
  voyage, its counters and timeline bars. Tacks with notes have a gilded rim.
- **Search** (`web/assets/js/search.js`): continents (`country.Code.Continent()`), countries,
  regions (spellings merged), animal groups (species names find their group) and cities
  (`web/assets/js/cities.js`, within 100 km, drawn as a dashed red-ink circle). All in the browser.
- **Panel stack** (`web/assets/js/guide.js`): place, group or cluster page (ink-stroke bars,
  usual sky, notes count, sightings by group) → field guide with "← back" and "Next →".
  Escape steps back, then closes.
- **Logbook**: a ruled parchment page and a table, stacked cards on phones. "Show on globe" flies to
  the pin and opens its page.

## Rules

- No photos on first load. Pins are JSON from `templ.JSONScript`, and pages are fetched on click,
  prefetched on hover.
- GBIF text only through templ (escaped) or `textContent`, never `innerHTML` built in JS.
- Reduced motion: no spinning, flying or weather. The timeline is a slider, and the globe redraws only when dragged.
- Radius 3–4px, page shadows (`--shadow-page`), focus ring brass on walnut and red ink on parchment.
