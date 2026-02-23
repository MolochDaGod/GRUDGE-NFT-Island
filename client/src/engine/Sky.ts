// ═══════════════════════════════════════════════════════════════════
// SKY — Procedural hemisphere gradient + subtle cloud layer
//
// Uses a large inverted sphere with a vertex-color gradient from
// zenith (deep blue) → horizon (warm haze). No cubemap needed.
// Follows the camera so the player can never reach the sky edge.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// ── Configurable colors ───────────────────────────────────────────

const ZENITH   = new THREE.Color(0x1a2a5e); // deep blue overhead
const HORIZON  = new THREE.Color(0x87CEEB); // light sky blue at horizon
const NADIR    = new THREE.Color(0x303040); // dark below horizon

// ── Sky Class ─────────────────────────────────────────────────────

export class Sky {
  readonly mesh: THREE.Mesh;
  private uniforms: { uTime: { value: number } };

  constructor() {
    const geo = new THREE.SphereGeometry(800, 32, 16);

    // Build vertex colors: gradient based on Y of each vertex normal
    const colors = new Float32Array(geo.attributes.position.count * 3);
    const pos = geo.attributes.position;
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 800; // -1 to 1

      if (y > 0) {
        // Above horizon: lerp zenith → horizon
        tmp.copy(ZENITH).lerp(HORIZON, 1 - y);
      } else {
        // Below horizon: lerp horizon → nadir
        tmp.copy(HORIZON).lerp(NADIR, -y);
      }

      colors[i * 3]     = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    this.uniforms = { uTime: { value: 0 } };

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000; // render first
  }

  /** Call each frame — moves sky to follow camera and advances time */
  update(cameraPosition: THREE.Vector3, _dt: number): void {
    this.mesh.position.copy(cameraPosition);
    this.uniforms.uTime.value += _dt;
  }

  /** Get the horizon color (useful for syncing scene fog) */
  get horizonColor(): THREE.Color {
    return HORIZON.clone();
  }
}
