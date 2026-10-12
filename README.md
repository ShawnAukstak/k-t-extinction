# K–T Extinction Simulator

An explorable, scientifically grounded 3D simulation of the Chicxulub impact and the end-Cretaceous (K-Pg, "K-T") extinction, for the web. Orbit a 66-million-year-old Earth, scrub a non-linear timeline from the asteroid's last hour through the first seconds, days and years to the recovery a million years later, fly down to the ground among the plants and animals, and share any moment as a link.

**Status:** runs locally; not hosted yet. Built so far (phases 0–5 in [`docs/plan/roadmap.md`](docs/plan/roadmap.md)):

- **The 66 Ma globe:** the PALEOMAP 65 Ma elevation model (with a cited correction at the impact site), coloured from a 66 Ma climate run, with a physically based atmosphere.
- **Timeline:** a non-linear scrubber from 1 hour before impact to 1 million years after, with event markers and cards.
- **Impact effects:**
  - fireball, crater, ejecta, the Artemieva & Morgan dust cloud, the Range et al. tsunami, and the scaling-law air blast;
  - impact winter from the Tabor et al. model runs, switchable between soot, SO₂ and dust.
- **Camera:** cinematic, fixed and free modes, plus procedural audio.
- **"What happened here?":** tap anywhere for that place's local history.
- **Places:** fossil sites, and "Where was my city?", which reconstructs modern cities to their 65 Ma positions.
- **Ground level:**
  - terrain down to ~5 m, with procedural plants and animal herds from curated, sourced species cards for 19 land and sea regions;
  - animals burn, are thrown by the blast, or starve in the winter; plants die, ferns take over, and forests return;
  - surviving lineages rebound, and early Paleocene mammals arrive on their published dates.
- **Confidence labels:** every claim is labelled **known**, **model**, **contested** or **chosen**, and links to its sources.

Next: better animal models, then the discoveries index and hosting.

## Requirements

- **Node.js** 20.19+ or 22.12+ (needed by Vite 8; developed on 23.6).
- **Python** 3.12 (for the data scripts).
- **About 2 GB of disk** for the downloaded source data.
- macOS or Linux. On macOS the browser tests use the real GPU (ANGLE/Metal). ImageMagick is needed only for the screenshot tools in `app/tools/`.

## Run it locally

The app's data is generated from public scientific datasets and is not stored in git. Build it once:

```sh
git clone https://github.com/ShawnAukstak/k-t-extinction.git
cd k-t-extinction

# 1. Data (once): ~1.8 GB download, then about a minute of processing
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/fetch.py            # source datasets → data/raw/
.venv/bin/python scripts/process_globe.py    # globe textures and heights → app/public/data/globe/
.venv/bin/python scripts/process_effects.py  # dust cloud, plume, impact winter → app/public/data/effects/
.venv/bin/python scripts/process_tsunami.py  # tsunami arrival and height → app/public/data/effects/
.venv/bin/python scripts/process_places.py   # plate model and cities → app/public/data/places/

# 2. App
cd app
npm install
npm run dev                                  # → http://127.0.0.1:5173
```

`scripts/fetch.py` skips files it already has, so it is safe to re-run. `--list` shows every source. See [`data/README.md`](data/README.md).

### Try these links

With the dev server running:

| Link | What |
|---|---|
| http://127.0.0.1:5173/#m=cine | The cinematic tour from the asteroid's approach |
| http://127.0.0.1:5173/#t=3600&c=28,-78,4500000,0,0&p=1&v=1 | One hour after impact: the ejecta cloud over North America |
| http://127.0.0.1:5173/#k=tanis | Tanis, North Dakota, the site of the seismic-surge deposit |
| http://127.0.0.1:5173/#t=-60&p=1&k=corral-bluffs&v=1 | Corral Bluffs, Colorado, one minute before impact. Press **Find dinosaurs nearby** to fly down to a herd |
| http://127.0.0.1:5173/#t=2.84e13&p=1&k=corral-bluffs&v=1 | The same place 900,000 years later. The forest has regrown, and **Find dinosaurs nearby** now finds the early mammals |

Tap any animal to see its species card. Press Play to watch the impact arrive.

## Controls

| Input | Action |
|---|---|
| Drag (mouse or one finger) | Pan the globe |
| Right-drag, or Ctrl/Shift-drag | Turn (left/right) and tilt (up/down) |
| Wheel or pinch | Zoom |
| Two-finger twist / vertical drag | Turn / tilt |
| Tap or click | "What happened here?" for that spot, or the species card for an animal |
| Space | Play / pause |
| ← / → (Shift for bigger steps) | Step along the timeline |
| `[` / `]` | Previous / next event |
| `+` / `−` | Faster / slower |
| `O` | Toggle the data overlay |
| Esc | Close the panel |

## Deep links

Every view is a URL hash, so any moment can be shared. The address bar updates as you move.

| Key | Meaning |
|---|---|
| `t` | Time in seconds since impact (negative before; e-notation allowed) |
| `c` | Camera: `lat,lon,range_m,heading_deg,tilt_deg` (tilt 0 = straight down) |
| `m` | Camera mode: `cine`, `fixed` or `free` |
| `k` | Fly to a place by id, e.g. `tanis`, `chicxulub`, `corral-bluffs` (see `data/curated/points-of-interest.yaml`) |
| `q`, `qn` | Open "What happened here?" at `lat,lon` (65 Ma frame), with an optional label |
| `w` | Impact-winter scenario: `soot`, `so2` or `dust` |
| `s`, `p` | Playback speed; `p=1` starts paused |
| `v` | Link format version |

Coordinates are 65 Ma positions, not modern ones.

## Tests

```sh
cd app
npx playwright install chromium webkit   # once
npm run check                            # types + unit tests (Vitest) + browser tests (Playwright: desktop, Pixel 7, iPhone 15)
```

`npm run check` must pass before every commit. It starts its own dev server on port 5173, or reuses one that is already running. The Python plate model has its own test: `.venv/bin/python scripts/tests/test_plates.py`.

## Layout

```
app/         the web app (Vite + TypeScript + three.js), unit tests (Vitest), browser tests (Playwright), dev tools
data/        dataset catalog, curated data (species cards, fauna regions, timeline, sources, places), committed;
             raw downloads and processed data live under data/ but are gitignored
docs/        vision, feasibility, plan + decision log, research (the science), tech (stack)
scripts/     data fetch and processing (Python), offline plate model, reference implementations
```

Start reading at [`docs/README.md`](docs/README.md). The science behind each effect is in `docs/research/`, and the decisions and their reasons are in [`docs/plan/decisions.md`](docs/plan/decisions.md).

## Licences

- **Code:** MIT ([`LICENSE`](LICENSE)).
- **Curated data and docs:** CC BY 4.0 ([`LICENSE-DATA.md`](LICENSE-DATA.md)).
- **Upstream datasets:** keep their own licences; [`data/catalog.yaml`](data/catalog.yaml) records each one with its credit line.
- **Exception:** the BRIDGE climate run that colours the land has no stated licence, so it is used for local development only and will be replaced by PhanDA (CC BY 4.0) before the app is published.
