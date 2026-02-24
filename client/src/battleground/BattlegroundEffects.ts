// ═══════════════════════════════════════════════════════════════════
// BATTLEGROUND EFFECTS — Particle + visual FX for combat
//
// Lightweight sprite-based particles: hit sparks, death smoke,
// spawn flash, attack slash trail. Each effect is a pooled system
// that recycles particles to avoid GC pressure.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// ── Particle types ───────────────────────────────────────────────

interface Particle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

// ── Effect Manager ───────────────────────────────────────────────

export class BattlegroundEffects {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private pool: THREE.Sprite[] = [];

  // Shared textures (generated procedurally)
  private sparkTex: THREE.Texture;
  private smokeTex: THREE.Texture;
  private glowTex: THREE.Texture;
  private slashTex: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkTex = this.makeRadialTexture(32, '#ffcc44', '#ff6600');
    this.smokeTex = this.makeRadialTexture(32, '#888888', '#333333');
    this.glowTex  = this.makeRadialTexture(48, '#66ccff', '#0044ff');
    this.slashTex = this.makeSlashTexture(64);
  }

  // ── Spawn effects ────────────────────────────────────────────

  /** Spark burst at hit location */
  hitSparks(position: THREE.Vector3, color: number = 0xffaa22, count = 8): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(3 + Math.random() * 4);

      this.emit(position, dir, this.sparkTex, color, {
        life: 0.3 + Math.random() * 0.3,
        startScale: 0.15 + Math.random() * 0.1,
        endScale: 0.02,
        startOpacity: 1,
      });
    }
  }

  /** Smoke puff on death */
  deathSmoke(position: THREE.Vector3, count = 12): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 1.5,
      );
      this.emit(position, dir, this.smokeTex, 0x666666, {
        life: 0.8 + Math.random() * 0.5,
        startScale: 0.3 + Math.random() * 0.3,
        endScale: 1.0,
        startOpacity: 0.7,
      });
    }
  }

  /** Blue glow flash on spawn/respawn */
  spawnGlow(position: THREE.Vector3, color: number = 0x44aaff): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle) * 2, 1 + Math.random(), Math.sin(angle) * 2);
      this.emit(position, dir, this.glowTex, color, {
        life: 0.6 + Math.random() * 0.3,
        startScale: 0.4,
        endScale: 0.8,
        startOpacity: 0.8,
      });
    }
  }

  /** Attack slash arc */
  attackSlash(position: THREE.Vector3, yaw: number, color: number = 0xffffff): void {
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    for (let i = 0; i < 3; i++) {
      const offset = right.clone().multiplyScalar((i - 1) * 0.3);
      const pos = position.clone().add(offset).add(fwd.clone().multiplyScalar(1.5));
      pos.y += 1;

      const vel = fwd.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.5, 0));
      this.emit(pos, vel, this.slashTex, color, {
        life: 0.2,
        startScale: 0.5,
        endScale: 0.1,
        startOpacity: 0.9,
      });
    }
  }

  /** Faction-colored ground ring (e.g., aggro indicator) */
  aggroRing(position: THREE.Vector3, color: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pos = position.clone();
      pos.x += Math.cos(angle) * 1.5;
      pos.z += Math.sin(angle) * 1.5;
      pos.y += 0.1;

      this.emit(pos, new THREE.Vector3(0, 0.5, 0), this.glowTex, color, {
        life: 0.4,
        startScale: 0.2,
        endScale: 0.05,
        startOpacity: 0.6,
      });
    }
  }

  // ── Update (call each frame) ─────────────────────────────────

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        // Recycle
        p.sprite.visible = false;
        this.scene.remove(p.sprite);
        this.pool.push(p.sprite);
        this.particles.splice(i, 1);
        continue;
      }

      const t = 1 - (p.life / p.maxLife); // 0 → 1
      // Move
      p.sprite.position.addScaledVector(p.velocity, dt);
      // Gravity
      p.velocity.y -= 5 * dt;
      // Scale
      const scale = p.startScale + (p.endScale - p.startScale) * t;
      p.sprite.scale.setScalar(scale);
      // Fade
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.startOpacity * (1 - t);
    }
  }

  // ── Internal ─────────────────────────────────────────────────

  private emit(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    texture: THREE.Texture,
    color: number,
    opts: { life: number; startScale: number; endScale: number; startOpacity: number },
  ): void {
    const sprite = this.getSprite(texture, color);
    sprite.position.copy(position);
    sprite.scale.setScalar(opts.startScale);
    (sprite.material as THREE.SpriteMaterial).opacity = opts.startOpacity;
    sprite.visible = true;
    this.scene.add(sprite);

    this.particles.push({
      sprite,
      velocity: velocity.clone(),
      life: opts.life,
      maxLife: opts.life,
      startScale: opts.startScale,
      endScale: opts.endScale,
      startOpacity: opts.startOpacity,
    });
  }

  private getSprite(texture: THREE.Texture, color: number): THREE.Sprite {
    let sprite = this.pool.pop();
    if (sprite) {
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map = texture;
      mat.color.setHex(color);
      mat.opacity = 1;
      mat.needsUpdate = true;
    } else {
      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
    }
    return sprite;
  }

  // ── Procedural textures ──────────────────────────────────────

  private makeRadialTexture(size: number, innerColor: string, outerColor: string): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.5, outerColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private makeSlashTexture(size: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffcc44';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(4, canvas.height - 4);
    ctx.quadraticCurveTo(size / 2, -4, size - 4, canvas.height / 2);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ── Cleanup ──────────────────────────────────────────────────

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.sprite);
      (p.sprite.material as THREE.SpriteMaterial).dispose();
    }
    for (const s of this.pool) {
      (s.material as THREE.SpriteMaterial).dispose();
    }
    this.particles = [];
    this.pool = [];
    this.sparkTex.dispose();
    this.smokeTex.dispose();
    this.glowTex.dispose();
    this.slashTex.dispose();
  }
}
