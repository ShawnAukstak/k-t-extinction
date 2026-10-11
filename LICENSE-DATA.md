# Data and documentation licence

The **code** in this repository is MIT-licensed (see `LICENSE`).

Our **curated data** (`data/curated/`) and **documentation** (`docs/`) are licensed under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/legalcode).

**Derived data products** (rasters, tiles and time series that `scripts/` builds from upstream
datasets) remain subject to the upstream licences. Every upstream source, its licence and the
credit it requires are listed in `data/catalog.yaml`. `ATTRIBUTION.md` and the in-app Credits
panel are generated from that file.

Policy (see `docs/plan/decisions.md`, D4):

- Only CC0, CC BY, public-domain or US-Government sources ship in the app.
- Sources with no stated licence are flagged `ship: false` in the catalog and are used only for
  local development until their authors grant permission or a licensed substitute replaces them.
- No non-commercial (NC) or no-derivatives (ND) sources.
