// Fetch the generated app data (not in git) for a deploy: the release asset named in data-bundle.json,
// checked against its sha256 and unpacked into public/data. Needs GH_DATA_TOKEN, a GitHub token with
// read-only access to this repo's contents. Does nothing if public/data is already there.
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
const token = process.env.GH_DATA_TOKEN;
if (!token) throw new Error("GH_DATA_TOKEN is not set (a GitHub token with read access to this repo's contents)");
const { repo, tag, asset, sha256 } = JSON.parse(readFileSync(join(app, 'data-bundle.json'), 'utf8'));
const api = `https://api.github.com/repos/${repo}`;
const headers = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };

const rel = await fetch(`${api}/releases/tags/${tag}`, { headers });
if (!rel.ok) throw new Error(`release ${tag}: HTTP ${rel.status} ${await rel.text()}`);
const a = (await rel.json()).assets?.find((x) => x.name === asset);
if (!a) throw new Error(`release ${tag} has no asset ${asset}`);
// The asset URL redirects to signed storage; fetch drops the Authorization header across origins.
const res = await fetch(`${api}/releases/assets/${a.id}`, { headers: { ...headers, Accept: 'application/octet-stream' } });
if (!res.ok) throw new Error(`download ${asset}: HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const got = createHash('sha256').update(buf).digest('hex');
if (got !== sha256) throw new Error(`checksum mismatch for ${tag}/${asset}: ${got} != ${sha256}`);
const file = join(mkdtempSync(join(tmpdir(), 'kt-data-')), asset);
writeFileSync(file, buf);
mkdirSync(join(app, 'public'), { recursive: true });
execFileSync('tar', ['-xzf', file, '-C', join(app, 'public')]);
console.log(`data: ${tag} (${(buf.length / 1e6).toFixed(1)} MB) unpacked into public/data`);
