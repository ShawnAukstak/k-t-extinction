import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vitest/config';
import { parse } from 'yaml';
import { isPacked, pack } from './src/core/packed';

/** Import data/curated/*.yaml as plain JSON modules (parsed at build time, no runtime YAML parser). */
function yamlPlugin(): Plugin {
  return {
    name: 'kt-yaml',
    transform(_code, id) {
      if (!/\.ya?ml$/.test(id)) return null;
      const data = parse(readFileSync(id, 'utf8'));
      return { code: `export default ${JSON.stringify(data)};`, map: null };
    },
  };
}

const TITLE = 'K–T Extinction Simulator';
const DESCRIPTION = 'The Chicxulub impact and the end of the dinosaurs, minute by minute, on a scientifically reconstructed 66-million-year-old Earth.';
/** Where Google Analytics treats consent as required: analytics cookies stay off there (cookieless pings only). */
const CONSENT_REGIONS = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' ');

/**
 * The site's address, including the path it is served under (GitHub Pages). SITE_URL overrides it,
 * e.g. for a custom domain; the production build is served from its path.
 */
const SITE = (process.env.SITE_URL || 'https://shawnaukstak.github.io/k-t-extinction').replace(/\/+$/, '');
const SITE_PATH = `${new URL(SITE).pathname.replace(/\/+$/, '')}/`;

/**
 * What the page tells search engines, link unfurlers and analytics: link previews, the canonical
 * link, structured data, robots.txt and sitemap.xml, all at SITE.
 *
 *   GA_ID             Google Analytics measurement ID (G-…): adds gtag.js (src/core/analytics.ts).
 *   GSC_VERIFICATION  Search Console's HTML-tag token, if verifying that way rather than through Analytics.
 */
function sitePlugin(): Plugin {
  const ga = process.env.GA_ID?.trim();
  const gsc = process.env.GSC_VERIFICATION?.trim();
  return {
    name: 'kt-site',
    transformIndexHtml(html) {
      const img = `${SITE}/og.jpg`;
      const tags = [
        `<meta property="og:image" content="${img}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta property="og:image:alt" content="An asteroid approaching the Earth of 66 million years ago" />',
        `<meta name="twitter:image" content="${img}" />`,
        `<meta property="og:url" content="${SITE}/" />`,
        `<link rel="canonical" href="${SITE}/" />`,
        `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: TITLE,
          url: `${SITE}/`,
          description: DESCRIPTION,
          image: img,
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Any (a web browser with WebGL 2)',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        })}</script>`,
      ];
      if (gsc) tags.push(`<meta name="google-site-verification" content="${gsc}" />`);
      if (ga) {
        // The URL follows playback (src/core/analytics.ts replaceUrl), which gtag.js would count as page
        // views; keep the browser's own replaceState from before gtag.js wraps it.
        tags.push(
          `<script>
      window.__ktReplaceState = history.replaceState.bind(history);
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      gtag('consent', 'default', { analytics_storage: 'denied', region: ${JSON.stringify(CONSENT_REGIONS)} });
      gtag('js', new Date());
      gtag('config', '${ga}', { allow_google_signals: false, allow_ad_personalization_signals: false });
    </script>`,
          `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>`,
        );
      }
      return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` });
      const day = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc><lastmod>${day}</lastmod></url>\n</urlset>\n`,
      });
    },
  };
}

/** Pack the binary data files in the build output (src/core/packed.ts): about 14 MB less to send. */
function packDataPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'kt-pack-data',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      const dir = join(outDir, 'data');
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (f.endsWith('.bin')) files.push(p);
        }
      };
      try { walk(dir); } catch { return; } // no data in this build
      let before = 0, after = 0;
      for (const f of files) {
        const raw = new Uint8Array(readFileSync(f));
        if (isPacked(raw)) continue;
        const packed = pack(raw, (b) => new Uint8Array(gzipSync(b, { level: 9 })));
        writeFileSync(f, packed);
        before += raw.length;
        after += packed.length;
      }
      if (files.length) console.log(`packed ${files.length} data files: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
    },
  };
}

// The dev server stays at the root so local links and the browser tests' default address work.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? SITE_PATH : '/',
  plugins: [yamlPlugin(), sitePlugin(), packDataPlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: ['..'] } },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
}));
