/**
 * Dev-only model sheet: every species' body, side and three-quarter views, on a neutral background,
 * scaled to fit its tile (sizes are printed). Not part of the build.
 *   /dev/models.html?lod=hi|lo&only=triceratops,tyrannosaurus&view=side|front|top
 */
import {
  AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { bodyGeometry, type Lod } from '../src/life/bodies';
import { loadRoster } from '../src/life/roster';

const q = new URLSearchParams(location.search);
const lod = (q.get('lod') ?? 'hi') as Lod;
const only = q.get('only')?.split(',');
const views = (q.get('view') ?? 'side,threequarter').split(',');

const TINTS = [0xa98b68, 0xd8cbb0, 0xb8946a, 0x8a6a52, 0x111111, 0xd9c4a0];

const { species } = await loadRoster();
const list = species.filter((s) => !only || only.includes(s.id)).sort((a, b) => a.group.localeCompare(b.group) || a.lengthM - b.lengthM);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setScissorTest(true);
document.body.append(renderer.domElement);
const cols = Math.max(1, Math.floor(window.innerWidth / Number(q.get('tile') ?? 300)));
const tileW = Math.floor(window.innerWidth / cols);
const tileH = Math.round(tileW * 0.62);
let tri = 0;
let i = 0;
for (const sp of list) {
  for (const view of views) {
    const g = bodyGeometry({ group: sp.group, lengthM: sp.lengthM, hipHeightM: sp.hipHeightM, variant: sp.id }, lod);
    tri += (g.index?.count ?? 0) / 3;
    // Colour by surface type (skin, keratin, feathers, membrane, eye, belly).
    const tint = g.attributes.tint.array as Float32Array;
    const col = new Float32Array(tint.length * 3);
    tint.forEach((t, k) => { const c = new Color(TINTS[Math.round(t)] ?? 0xff00ff).convertSRGBToLinear(); col.set([c.r, c.g, c.b], k * 3); });
    g.setAttribute('color', new (g.attributes.position.constructor as any)(col, 3));
    const scene = new Scene();
    scene.background = new Color(0x2a2f37);
    scene.add(new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    scene.add(new AmbientLight(0xffffff, 1.1));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 5, 2);
    scene.add(sun);
    const box = new Box3().setFromBufferAttribute(g.attributes.position as any);
    const size = box.getSize(new Vector3()), ctr = box.getCenter(new Vector3());
    const cam = new PerspectiveCamera(20, tileW / tileH, 0.01, 1000);
    const d = Math.max(size.z * 1.05, size.y * 1.7) / (2 * Math.tan((10 * Math.PI) / 180)) * 1.1;
    const dir = view === 'side' ? new Vector3(1, 0.05, 0) : view === 'front' ? new Vector3(0, 0.1, 1) : view === 'top' ? new Vector3(0, 1, 0.001) : new Vector3(0.8, 0.35, 0.6);
    cam.position.copy(ctr).addScaledVector(dir.normalize(), d);
    cam.lookAt(ctr);
    const x = (i % cols) * tileW, y = Math.floor(i / cols) * tileH;
    renderer.setViewport(x, window.innerHeight - y - tileH, tileW, tileH);
    renderer.setScissor(x, window.innerHeight - y - tileH, tileW, tileH);
    renderer.render(scene, cam);
    const label = document.createElement('div');
    label.className = 'label';
    label.style.left = `${x + 4}px`; label.style.top = `${y + 4}px`;
    label.textContent = `${sp.name} · ${sp.group} · ${sp.lengthM} m · ${Math.round((g.index?.count ?? 0) / 3)} tris`;
    document.body.append(label);
    i++;
  }
}
(window as any).__done = { species: list.length, tris: tri };
