/**
 * Place markers: small labelled dots projected onto the globe each frame, hidden when on the far
 * side of the planet or off-screen. Labels appear when zoomed in enough to read them.
 */
import { type PerspectiveCamera, Vector3 } from 'three';
import { EARTH_RADIUS } from '../config';
import { latLonToVec } from '../core/geo';
import type { Poi } from '../core/pois';

export class Markers {
  readonly root: HTMLElement;
  onSelect: ((p: Poi) => void) | null = null;
  visible = true;
  private readonly items: { poi: Poi; el: HTMLButtonElement; pos: Vector3 }[] = [];
  private readonly v = new Vector3();
  private readonly toCam = new Vector3();

  constructor(parent: HTMLElement, pois: readonly Poi[]) {
    this.root = document.createElement('div');
    this.root.className = 'kt-markers-layer';
    for (const poi of pois) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `kt-place${poi.tags.includes('context') ? ' kt-place-context' : ''}${poi.tags.includes('impact') ? ' kt-place-impact' : ''}`;
      el.innerHTML = `<i></i><span>${poi.name}</span>`;
      el.setAttribute('aria-label', poi.name);
      el.dataset.place = poi.id;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(poi); });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.root.append(el);
      this.items.push({ poi, el, pos: latLonToVec(poi.paleo.lat, poi.paleo.lon, EARTH_RADIUS) });
    }
    parent.append(this.root);
  }

  update(camera: PerspectiveCamera, width: number, height: number, showLabels: boolean): void {
    this.root.hidden = !this.visible;
    if (!this.visible) return;
    this.root.classList.toggle('kt-labels', showLabels);
    for (const it of this.items) {
      this.toCam.copy(camera.position).sub(it.pos);
      // Facing the camera (not behind the planet's limb)?
      const facing = this.toCam.dot(it.pos) > 0;
      this.v.copy(it.pos).project(camera);
      const on = facing && this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
      if (!on) {
        if (!it.el.hidden) it.el.hidden = true;
        continue;
      }
      if (it.el.hidden) it.el.hidden = false;
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
