import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import { parse } from 'yaml';

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

/**
 * Link previews: the Open Graph image wants an absolute URL. On Render the build knows the site's URL
 * (RENDER_EXTERNAL_URL; SITE_URL overrides); elsewhere a relative path, which most unfurlers resolve.
 */
function ogImagePlugin(): Plugin {
  return {
    name: 'kt-og-image',
    transformIndexHtml(html) {
      const site = (process.env.SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? '').replace(/\/$/, '');
      const img = site ? `${site}/og.jpg` : 'og.jpg';
      const tags = [
        `<meta property="og:image" content="${img}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta property="og:image:alt" content="An asteroid approaching the Earth of 66 million years ago" />',
        `<meta name="twitter:image" content="${img}" />`,
        ...(site ? [`<meta property="og:url" content="${site}/" />`] : []),
      ].join('\n    ');
      return html.replace('</head>', `    ${tags}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [yamlPlugin(), ogImagePlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: ['..'] } },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
});
