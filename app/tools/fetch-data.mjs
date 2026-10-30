// Fetch the generated app data (not in git): the public release asset named in data-bundle.json,
// checked against its sha256 and unpacked into public/data. Used by the deploy build, and locally
// instead of running the data scripts. Does nothing if public/data is already there.
//   node tools/fetch-data.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(app, 'public/data/globe/manifest.json'))) {
  console.log('data: public/data already present');
  process.exit(0);
}
const { repo, tag, asset, sha256 } = JSON.parse(readFileSync(join(app, 'data-bundle.json'), 'utf8'));
const url = `https://github.com/${repo}/releases/download/${tag}/${asset}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const got = createHash('sha256').update(buf).digest('hex');
if (got !== sha256) throw new Error(`checksum mismatch for ${tag}/${asset}: ${got} != ${sha256}`);
const file = join(mkdtempSync(join(tmpdir(), 'kt-data-')), asset);
writeFileSync(file, buf);
mkdirSync(join(app, 'public'), { recursive: true });
execFileSync('tar', ['-xzf', file, '-C', join(app, 'public')]);
console.log(`data: ${tag} (${(buf.length / 1e6).toFixed(1)} MB) unpacked into public/data`);
