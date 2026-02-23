// ═══════════════════════════════════════════════════════════════════
// INSTANCED MESH MANAGER
//
// Pools InstancedMesh objects per model type for efficient rendering
// of many entities that share the same geometry/material.
// Based on Three.js webgl_instancing_dynamic + webgl_instancing_morph.
//
// USAGE:
//   const mgr = new InstancedMeshManager(scene);
//   mgr.registerModel('goblin', geometry, material, 256);
//   const id = mgr.addInstance('goblin');
//   mgr.updateTransform(id, position, quaternion, scale);
//   mgr.removeInstance(id);
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// ── Types ───────────────────────────────────────────────────────

interface ModelPool {
  mesh: THREE.InstancedMesh;
  /** Map from instance ID → slot index in the InstancedMesh */
  slotMap: Map<number, number>;
  /** Free slot indices (recycled from removed instances) */
  freeSlots: number[];
  /** Next slot to allocate if no free slots */
  nextSlot: number;
  /** Max instances this pool can hold */
  maxInstances: number;
  /** Has an AnimationMixer for morph targets? */
  mixer: THREE.AnimationMixer | null;
  /** Dummy object for computing matrices */
  dummy: THREE.Object3D;
}

// ── Manager ─────────────────────────────────────────────────────

let nextInstanceId = 1;

export class InstancedMeshManager {
  private scene: THREE.Scene;
  private pools = new Map<string, ModelPool>();
  /** Reverse lookup: instance ID → model key */
  private instanceToModel = new Map<number, string>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ── Model Registration ────────────────────────────────────────

  /**
   * Register a model type for instancing.
   * @param key           Unique model identifier (e.g. 'goblin', 'tree_oak')
   * @param geometry      Shared geometry
   * @param material      Shared material
   * @param maxInstances  Maximum simultaneous instances of this model
   * @param animations    Optional AnimationClip array for morph targets
   */
  registerModel(
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    maxInstances = 256,
    animations?: THREE.AnimationClip[],
  ): void {
    if (this.pools.has(key)) return;

    const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // We cull at the entity level
    mesh.count = 0; // Start with 0 visible instances

    // Initialize all transforms to zero-scale (invisible)
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = 0; i < maxInstances; i++) {
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Optional: set up mixer for morph target animations
    let mixer: THREE.AnimationMixer | null = null;
    if (animations && animations.length > 0) {
      // Create a dummy scene for the mixer to drive morph targets
      const dummyScene = new THREE.Group();
      dummyScene.add(mesh);
      mixer = new THREE.AnimationMixer(dummyScene);
      const action = mixer.clipAction(animations[0]);
      action.play();
    }

    this.scene.add(mesh);

    this.pools.set(key, {
      mesh,
      slotMap: new Map(),
      freeSlots: [],
      nextSlot: 0,
      maxInstances,
      mixer,
      dummy: new THREE.Object3D(),
    });
  }

  // ── Instance Lifecycle ────────────────────────────────────────

  /**
   * Add an instance of a registered model.
   * @returns Instance ID (used for updates and removal)
   */
  addInstance(modelKey: string): number {
    const pool = this.pools.get(modelKey);
    if (!pool) {
      console.warn(`[InstancedMeshManager] Unknown model: ${modelKey}`);
      return -1;
    }

    // Allocate a slot
    let slot: number;
    if (pool.freeSlots.length > 0) {
      slot = pool.freeSlots.pop()!;
    } else if (pool.nextSlot < pool.maxInstances) {
      slot = pool.nextSlot++;
    } else {
      console.warn(`[InstancedMeshManager] Pool full for ${modelKey}`);
      return -1;
    }

    const id = nextInstanceId++;
    pool.slotMap.set(id, slot);
    this.instanceToModel.set(id, modelKey);

    // Update visible count
    pool.mesh.count = Math.max(pool.mesh.count, slot + 1);

    return id;
  }

  /**
   * Remove an instance and recycle its slot.
   */
  removeInstance(instanceId: number): void {
    const modelKey = this.instanceToModel.get(instanceId);
    if (!modelKey) return;

    const pool = this.pools.get(modelKey);
    if (!pool) return;

    const slot = pool.slotMap.get(instanceId);
    if (slot === undefined) return;

    // Hide the slot by setting zero scale
    pool.dummy.scale.set(0, 0, 0);
    pool.dummy.updateMatrix();
    pool.mesh.setMatrixAt(slot, pool.dummy.matrix);
    pool.mesh.instanceMatrix.needsUpdate = true;

    // Recycle slot
    pool.slotMap.delete(instanceId);
    pool.freeSlots.push(slot);
    this.instanceToModel.delete(instanceId);
  }

  // ── Transform Updates ─────────────────────────────────────────

  /**
   * Update an instance's world transform.
   */
  updateTransform(
    instanceId: number,
    position: THREE.Vector3,
    quaternion?: THREE.Quaternion,
    scale?: THREE.Vector3,
  ): void {
    const modelKey = this.instanceToModel.get(instanceId);
    if (!modelKey) return;

    const pool = this.pools.get(modelKey);
    if (!pool) return;

    const slot = pool.slotMap.get(instanceId);
    if (slot === undefined) return;

    pool.dummy.position.copy(position);
    if (quaternion) pool.dummy.quaternion.copy(quaternion);
    if (scale) pool.dummy.scale.copy(scale);
    else pool.dummy.scale.set(1, 1, 1);
    pool.dummy.updateMatrix();

    pool.mesh.setMatrixAt(slot, pool.dummy.matrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Set per-instance color.
   */
  setColor(instanceId: number, color: THREE.Color): void {
    const modelKey = this.instanceToModel.get(instanceId);
    if (!modelKey) return;

    const pool = this.pools.get(modelKey);
    if (!pool) return;

    const slot = pool.slotMap.get(instanceId);
    if (slot === undefined) return;

    pool.mesh.setColorAt(slot, color);
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }

  // ── Morph Target Animation ────────────────────────────────────

  /**
   * Set morph target weights for an instance (for animated models).
   * Uses the pattern from webgl_instancing_morph example.
   */
  setMorph(instanceId: number, time: number): void {
    const modelKey = this.instanceToModel.get(instanceId);
    if (!modelKey) return;

    const pool = this.pools.get(modelKey);
    if (!pool || !pool.mixer) return;

    const slot = pool.slotMap.get(instanceId);
    if (slot === undefined) return;

    // Advance the mixer to the desired time, then copy morph state
    pool.mixer.setTime(time);
    pool.mesh.setMorphAt(slot, pool.dummy);
    if (pool.mesh.morphTexture) pool.mesh.morphTexture.needsUpdate = true;
  }

  // ── Per-Frame ─────────────────────────────────────────────────

  /**
   * Call once per frame after all transform updates.
   * Recomputes bounding spheres for frustum culling.
   */
  flush(): void {
    for (const pool of this.pools.values()) {
      if (pool.mesh.count > 0) {
        pool.mesh.computeBoundingSphere();
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────

  getInstanceCount(modelKey: string): number {
    const pool = this.pools.get(modelKey);
    return pool ? pool.slotMap.size : 0;
  }

  getTotalInstances(): number {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.slotMap.size;
    return total;
  }

  getDebugInfo(): string {
    const parts: string[] = [];
    for (const [key, pool] of this.pools) {
      parts.push(`${key}:${pool.slotMap.size}/${pool.maxInstances}`);
    }
    return `Instanced: ${parts.join(', ') || 'none'}`;
  }
}
