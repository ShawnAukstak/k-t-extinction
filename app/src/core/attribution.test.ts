import { expect, it } from 'vitest';
import catalog from '../../../data/catalog.yaml';
import { attributionMarkdown, type CatalogEntry } from './attribution';

it('ATTRIBUTION.md matches data/catalog.yaml (update with -u)', async () => {
  const md = attributionMarkdown((catalog as { sources: CatalogEntry[] }).sources);
  expect(md).not.toContain('bridge_texyn');
  await expect(md).toMatchFileSnapshot('../../../ATTRIBUTION.md');
});
