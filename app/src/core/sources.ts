/** Bibliography from data/curated/sources.yaml (every DOI checked against Crossref). */
import raw from '../../../data/curated/sources.yaml';

export interface Source {
  authors: string;
  year: number;
  title: string;
  journal?: string;
  doi: string | null;
  url: string;
  open_access?: boolean | null;
  short: string;
}

export const SOURCES: Readonly<Record<string, Source>> = (raw as { sources: Record<string, Source> }).sources;

export function source(key: string): Source | undefined {
  return SOURCES[key];
}
