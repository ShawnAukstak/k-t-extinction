/**
 * ATTRIBUTION.md, generated from data/catalog.yaml (the sources the app ships) so the credits can't
 * drift from the catalog. src/core/attribution.test.ts keeps the file in step:
 * `npx vitest run src/core/attribution.test.ts -u` rewrites it after a catalog change.
 */
export interface CatalogEntry {
  id: string; name: string; group: string; role: string; licence: string | null; ship: boolean; credit: string; citation?: string; landing?: string;
}

const LICENCES: Record<string, string> = {
  'CC-BY-4.0': '[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)',
  'CC0-1.0': '[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)',
  'public-domain': 'Public domain',
};

export function attributionMarkdown(sources: CatalogEntry[]): string {
  const shipped = sources.filter((s) => s.ship);
  const lines = [
    '# Attribution',
    '',
    '<!-- Generated from data/catalog.yaml by app/src/core/attribution.ts. Do not edit by hand. -->',
    '',
    'The code is MIT-licensed (`LICENSE`); our curated data and documentation are CC BY 4.0 (`LICENSE-DATA.md`).',
    'The app is built from the published datasets and papers below. We regridded, resampled, recoloured and',
    'combined their data; `scripts/` shows exactly how, and `data/catalog.yaml` lists every file used.',
    '',
  ];
  const section = (title: string, list: CatalogEntry[]) => {
    lines.push(`## ${title}`, '');
    for (const s of list) entry(s);
  };
  const entry = (s: CatalogEntry) => {
    lines.push(`### ${s.name}`, '');
    lines.push(`- **Used for:** ${s.role.replace(/\s+/g, ' ').trim()}`);
    lines.push(`- **Licence:** ${s.licence ? LICENCES[s.licence] ?? s.licence : 'Not stated (we use the published method, not the data)'}`);
    lines.push(`- **Credit:** ${s.credit}`);
    if (s.citation) lines.push(`- **Cite:** ${s.citation.replace(/\s+/g, ' ').trim()}`);
    if (s.landing) lines.push(`- **Source:** <${s.landing}>`);
    lines.push('');
  };
  section('Data and research', shipped.filter((s) => s.group !== 'reference'));
  section('Reference datasets and methods', shipped.filter((s) => s.group === 'reference'));
  lines.push(
    '## Code',
    '',
    '- 3-D simplex noise from [webgl-noise](https://github.com/ashima/webgl-noise), © 2011 Ashima Arts and 2011–2016 Stefan Gustavson, MIT License (notice in `app/src/render/clouds.ts`).',
    '- [three.js](https://threejs.org/), MIT License, and the other npm packages in `app/package.json`, each under its own licence.',
    '',
  );
  return lines.join('\n');
}
