# k-t-extinction

An explorable, scientifically grounded 3D simulation of the Chicxulub impact and the end-Cretaceous (K-Pg / "K-T") extinction, for the web. Orbit a 66-million-year-old Earth, scrub a non-linear timeline from the asteroid's approach through the first seconds, hours, years and millennia, and share any moment as a link.

**Status:** early build, running locally. The globe renders from the real 65 Ma paleo-elevation data with a physically based atmosphere, deep-linkable camera, and phone support. The timeline and impact effects come next. See `docs/plan/roadmap.md`.

```
app/         the web app (Vite + TypeScript + three.js), unit tests (Vitest) and browser tests (Playwright)
data/        catalog of upstream datasets, curated corrections; raw/processed data live here, gitignored
docs/        vision, feasibility, plan + decision log, research (science), tech (stack)
scripts/     data fetch + processing (Python), reference implementations
```

## Run it locally

```sh
# 1. data (once): ~1.8 GB download, then build the globe textures
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/fetch.py
.venv/bin/python scripts/process_globe.py

# 2. app
cd app && npm install && npm run dev        # http://127.0.0.1:5173
npm test                                    # unit tests
npx playwright install chromium webkit && npm run test:e2e   # browser tests (desktop + phone)
```

Start reading at [`docs/README.md`](docs/README.md).

Licences: code MIT (`LICENSE`); our curated data and docs CC BY 4.0 (`LICENSE-DATA.md`); upstream datasets keep their own licences (`data/catalog.yaml`).
