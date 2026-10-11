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

export default defineConfig({
  plugins: [yamlPlugin()],
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: ['..'] } },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
});
