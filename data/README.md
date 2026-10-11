# data/

Source data for the simulator.

Principle: **raw inputs are immutable and cited; everything the app consumes is derived by a script.** If a number in the app can't be traced back through `processed/ → raw/ → catalog.yaml → docs/research/`, it doesn't belong in the app.

## Layout

```
data/
  README.md            ← this file
  catalog.yaml         ← every upstream dataset: URL, size, md5, licence, may-it-ship, credit line
  raw/                 ← untouched downloads (gitignored), re-created by scripts/fetch.py
    .fetched.json      ← fetch dates + checksums (PBDB results change over time)
    paleogeography/    ← PaleoDEM, PaleoCoastlines, (reference) Dutkiewicz bathymetry
    climate/           ← BRIDGE HadCM3L texyn, Scotese 2021 temperatures, Pohl 2022 Köppen
    impact/            ← Range 2022 tsunami, Artemieva 2020 dust cloud, Tabor 2020 impact winter
    paleontology/      ← PBDB occurrence pulls, Benson 2014 body masses
  processed/           ← intermediate products and previews (gitignored)
  curated/             ← small hand-edited files that ARE committed
    dem-corrections.yaml   ← cited edits to the PaleoDEM (e.g. the impact site was under the sea)
```

App-ready assets are written to `app/public/data/` (gitignored) so the dev server serves them.

## Rebuild everything

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/fetch.py                 # ~1.8 GB of `core` sources into data/raw/
.venv/bin/python scripts/process_globe.py         # cube-face textures → app/public/data/globe/
```

`scripts/fetch.py --list` shows every source; `--group heavy` adds the 7 GB tsunami sea-surface-height archive.

## Decisions that shape this folder

- Large files stay out of git (decision D1 in `docs/plan/decisions.md`). They'll move to object storage when we deploy.
- PALEOMAP is the canonical plate frame; points are reconstructed at 65 Ma to match the terrain slice (D2).
- Sources without a stated licence are flagged `ship: false` in the catalog and used for local development only (D4). Today that's the BRIDGE climate run that colours the land; its licensed substitute is PhanDA (same model family, CC BY 4.0).
