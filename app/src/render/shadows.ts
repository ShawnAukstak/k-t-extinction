/**
 * Sun shadows near the ground: one shadow map from the Sun covering a few hundred metres around the
 * camera (wider the higher it is), into which plants and animals render with their own animated
 * shapes (their materials' SHADOW_PASS variants: same vertex shader, alpha-tested foliage). The
 * ground, plants and animals look it up with hardware-filtered depth comparisons.
 *
 * Precision: world positions are ~6.4e6 m, too large for float32 shadow coordinates. Every shader
 * already has an exact view-space position (three.js composes model-view matrices in float64), so the
 * one uniform is the view → shadow-clip transform, composed on the CPU in float64 each frame.
 */
import {
  type BufferGeometry, DepthTexture, LessEqualCompare, Matrix4, NearestFilter, LinearFilter, type Object3D, OrthographicCamera, type PerspectiveCamera,
  Scene, UnsignedIntType, Vector3, WebGLRenderTarget, type WebGLRenderer, type Material, type Mesh,
} from 'three';

/** Vertex side: call shadowCoords(mv) with the view-space position. */
export const SHADOW_VERT = /* glsl */ `
uniform mat4 uShadowFromView;
varying vec3 vShadow;
void shadowCoords(vec4 mv) {
  vec4 s = uShadowFromView * mv;
  vShadow = s.xyz * 0.5 + 0.5;
}`;

/** Fragment side: sunShadow(bias) is 1 in sunlight, 0 in shadow (soft-edged, fading out at the map's edge). */
export const SHADOW_FRAG = /* glsl */ `
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
varying vec3 vShadow;
float sunShadow(float bias) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 c = vShadow;
  vec2 e = smoothstep(0.0, 0.25, c.xy) * smoothstep(1.0, 0.75, c.xy);
  float edge = e.x * e.y * step(0.0, c.z) * step(c.z, 1.0) * uShadowOn;
  if (edge <= 0.0) return 1.0;
  float z = c.z - bias;
  float o = uShadowTexel;
  float s = 0.25 * (texture(uShadowMap, vec3(c.xy + vec2(-o, -o), z)) + texture(uShadowMap, vec3(c.xy + vec2(o, -o), z))
                  + texture(uShadowMap, vec3(c.xy + vec2(-o, o), z)) + texture(uShadowMap, vec3(c.xy + vec2(o, o), z)));
  return mix(1.0, s, edge);
}`;

export interface ShadowOptions {
  size: number;
  /** Only below this camera height above the ground (m). */
  maxAltitude: number;
}

/** A group of cells whose instanced meshes cast shadows with a given material variant. */
export interface Caster { group: Object3D; shadowMaterial: Material; /** Half-diagonal of its cells, m. */ cellRadius: number }

export class SunShadows {
  readonly uniforms = {
    uShadowMap: { value: null as DepthTexture | null },
    uShadowFromView: { value: new Matrix4() },
    uShadowOn: { value: 0 },
    uShadowTexel: { value: 1 / 2048 },
  };
  private readonly target: WebGLRenderTarget;
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  private readonly scene = new Scene();
  private readonly center = new Vector3();
  private readonly _a = new Vector3();
  private readonly _b = new Vector3();
  private readonly _m = new Matrix4();
  active = false;
  /** Half-width of the shadowed square, m. */
  radius = 150;

  constructor(private readonly opt: ShadowOptions) {
    const depth = new DepthTexture(opt.size, opt.size, UnsignedIntType);
    depth.compareFunction = LessEqualCompare;
    depth.minFilter = depth.magFilter = LinearFilter;
    this.target = new WebGLRenderTarget(opt.size, opt.size, { depthTexture: depth, depthBuffer: true, minFilter: NearestFilter, magFilter: NearestFilter });
    this.uniforms.uShadowMap.value = depth;
    this.uniforms.uShadowTexel.value = 0.5 / opt.size;
    this.scene.matrixWorldAutoUpdate = true;
  }

  /**
   * Create the depth texture on the GPU now: until the target is first used, three.js would bind a
   * colour placeholder to the shadow sampler, which WebKit rejects.
   */
  init(renderer: WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear(false, true, false);
    renderer.setRenderTarget(prev);
  }

  /**
   * Place the shadow camera for this frame and render the casters into it. groundAlt is the camera's
   * height above the ground; sunDir points toward the Sun (world).
   */
  render(renderer: WebGLRenderer, camera: PerspectiveCamera, sunDir: Vector3, groundAlt: number, casters: Caster[]): void {
    const up = this._a.copy(camera.position).normalize();
    const sunUp = sunDir.dot(up);
    this.active = groundAlt < this.opt.maxAltitude && sunUp > 0.03;
    this.uniforms.uShadowOn.value = this.active ? Math.min(1, (sunUp - 0.03) / 0.05) * Math.min(1, (this.opt.maxAltitude - groundAlt) / (0.3 * this.opt.maxAltitude)) : 0;
    if (!this.active) return;
    // Centre: the ground under the camera, pushed ahead along the view so more of what is seen is covered.
    // Wide enough to cover most of the drawn plants, so shadows don't end in a line among them.
    this.radius = Math.min(900, Math.max(150, groundAlt * 1.5 + 150));
    const fwd = this._b.set(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    this.center.copy(camera.position).addScaledVector(up, -groundAlt).addScaledVector(fwd, this.radius * 0.45);
    // Light space: look along −sunDir; snap the centre to whole texels so shadows don't shimmer.
    const R = this.radius, D = 600;
    const lightUp = Math.abs(sunDir.dot(up)) > 0.99 ? new Vector3(1, 0, 0) : up.clone();
    const right = new Vector3().crossVectors(lightUp, sunDir).normalize();
    const vUp = new Vector3().crossVectors(sunDir, right).normalize();
    const texel = (2 * R) / this.opt.size;
    const cr = this.center.dot(right), cu = this.center.dot(vUp);
    this.center.addScaledVector(right, Math.round(cr / texel) * texel - cr).addScaledVector(vUp, Math.round(cu / texel) * texel - cu);
    const cam = this.cam;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 2 * D;
    cam.position.copy(this.center).addScaledVector(sunDir, D);
    cam.up.copy(vUp);
    cam.lookAt(this.center);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    // view → shadow clip, in float64.
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(camera.matrixWorld);
    this.uniforms.uShadowFromView.value.copy(this._m);

    // Render the casters near the shadowed square with their shadow materials.
    const reach = R * 1.5 + 50;
    const swapped: [Mesh, Material, boolean, BufferGeometry][] = [];
    const parents: [Object3D, Object3D | null][] = [];
    for (const c of casters) {
      parents.push([c.group, c.group.parent]);
      this.scene.add(c.group);
      c.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        swapped.push([m, m.material as Material, m.visible, m.geometry]);
        m.material = c.shadowMaterial;
        if (m.userData.shadowGeometry) m.geometry = m.userData.shadowGeometry as BufferGeometry;
        // Cells far from the shadowed square are skipped (their meshes span the whole cell).
        const cell = m.parent ?? m;
        cell.updateMatrixWorld();
        const d = this._b.setFromMatrixPosition(cell.matrixWorld).distanceTo(this.center);
        m.visible = m.visible && d < reach + c.cellRadius;
      });
    }
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear(false, true, false);
    renderer.render(this.scene, cam);
    renderer.setRenderTarget(prevTarget);
    for (const [m, mat, vis, geo] of swapped) { m.material = mat; m.visible = vis; m.geometry = geo; }
    for (const [g, p] of parents) { if (p) p.add(g); else this.scene.remove(g); }
  }
}
