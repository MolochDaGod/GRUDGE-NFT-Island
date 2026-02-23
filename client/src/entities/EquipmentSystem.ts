// ═══════════════════════════════════════════════════════════════════
// EQUIPMENT SYSTEM
//
// Finds attachment bones on a loaded character skeleton and
// parents weapon/shield/prop models to them at runtime.
//
// Supports both Toon-RTS and Mixamo skeletons by searching
// common bone naming patterns.
//
// Usage:
//   const equip = new EquipmentSystem(character);
//   const sword = await assetLoader.loadWeapon('iron_sword');
//   equip.attachMainHand(sword);
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import type { LoadedCharacter } from '../assets/AssetLoader.js';

// ── Bone Slot Definitions ─────────────────────────────────────────

export type SlotName =
  | 'mainHand'   // Right hand — swords, axes, maces, wands, etc.
  | 'offHand'    // Left hand — shields, tomes, off-hand relics
  | 'twoHand'    // Both hands — greatswords, staves, bows (uses mainHand bone)
  | 'back'       // Back mount — sheathed weapons, capes
  | 'head'       // Head — helmets, crowns, hoods
  | 'hip';       // Hip — holstered daggers, pouches

/** Bone search patterns per slot, ordered by priority */
const BONE_PATTERNS: Record<SlotName, string[][]> = {
  mainHand: [
    ['hand_r', 'weapon_r'],
    ['righthand', 'right_hand', 'r_hand'],
    ['hand.r', 'hand_right'],
    ['weapon_bone_r', 'weapon_r'],
    ['mixamorig:righthand'],
  ],
  offHand: [
    ['hand_l', 'weapon_l', 'shield'],
    ['lefthand', 'left_hand', 'l_hand'],
    ['hand.l', 'hand_left'],
    ['shield_bone', 'weapon_bone_l'],
    ['mixamorig:lefthand'],
  ],
  twoHand: [
    // Falls back to mainHand bone
    ['hand_r', 'weapon_r'],
    ['righthand', 'right_hand'],
    ['mixamorig:righthand'],
  ],
  back: [
    ['spine_03', 'spine3', 'upper_back'],
    ['spine.003', 'spine_upper'],
    ['mixamorig:spine2'],
  ],
  head: [
    ['head', 'head_bone'],
    ['mixamorig:head'],
  ],
  hip: [
    ['pelvis', 'hips', 'hip_bone'],
    ['mixamorig:hips'],
  ],
};

// ── Equipment Slot State ──────────────────────────────────────────

interface SlotState {
  bone: THREE.Bone | null;
  attached: THREE.Group | null;
  /** Position/rotation offset for this slot */
  offset: THREE.Vector3;
  rotOffset: THREE.Euler;
}

// ── Equipment System ──────────────────────────────────────────────

export class EquipmentSystem {
  private character: LoadedCharacter;
  private slots: Map<SlotName, SlotState> = new Map();

  constructor(character: LoadedCharacter) {
    this.character = character;
    this.discoverBones();
  }

  // ── Bone Discovery ──────────────────────────────────────────────

  private discoverBones(): void {
    // Collect all bones from the skeleton
    const boneMap = new Map<string, THREE.Bone>();
    this.character.group.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        boneMap.set(child.name.toLowerCase(), child as THREE.Bone);
      }
    });

    // Match bones to slots
    for (const [slotName, patternGroups] of Object.entries(BONE_PATTERNS)) {
      const slot = slotName as SlotName;
      let found: THREE.Bone | null = null;

      for (const patterns of patternGroups) {
        if (found) break;
        for (const pattern of patterns) {
          const bone = boneMap.get(pattern);
          if (bone) {
            found = bone;
            break;
          }
          // Fuzzy match: check if any bone name contains the pattern
          for (const [name, b] of boneMap) {
            if (name.includes(pattern)) {
              found = b;
              break;
            }
          }
          if (found) break;
        }
      }

      this.slots.set(slot, {
        bone: found,
        attached: null,
        offset: new THREE.Vector3(),
        rotOffset: new THREE.Euler(),
      });

      if (found) {
        console.log(`[EquipmentSystem] ${slot} → bone "${found.name}"`);
      } else {
        console.log(`[EquipmentSystem] ${slot} → no bone found`);
      }
    }
  }

  // ── Attach / Detach ─────────────────────────────────────────────

  /** Attach a model to the main hand (right hand) */
  attachMainHand(model: THREE.Group, offset?: THREE.Vector3, rotation?: THREE.Euler): boolean {
    return this.attachToSlot('mainHand', model, offset, rotation);
  }

  /** Attach a model to the off hand (left hand) — shields, tomes */
  attachOffHand(model: THREE.Group, offset?: THREE.Vector3, rotation?: THREE.Euler): boolean {
    return this.attachToSlot('offHand', model, offset, rotation);
  }

  /** Attach a two-handed weapon (uses mainHand bone) */
  attachTwoHand(model: THREE.Group, offset?: THREE.Vector3, rotation?: THREE.Euler): boolean {
    // Detach both hands first
    this.detach('mainHand');
    this.detach('offHand');
    return this.attachToSlot('twoHand', model, offset, rotation);
  }

  /** Attach to any named slot */
  attachToSlot(
    slot: SlotName,
    model: THREE.Group,
    offset?: THREE.Vector3,
    rotation?: THREE.Euler,
  ): boolean {
    const state = this.slots.get(slot);
    if (!state?.bone) {
      console.warn(`[EquipmentSystem] No bone found for slot "${slot}"`);
      return false;
    }

    // Detach current item in this slot
    this.detach(slot);

    // Apply offset
    if (offset) {
      model.position.copy(offset);
      state.offset.copy(offset);
    }
    if (rotation) {
      model.rotation.copy(rotation);
      state.rotOffset.copy(rotation);
    }

    // Parent model to bone
    state.bone.add(model);
    state.attached = model;

    console.log(`[EquipmentSystem] Attached to ${slot} (bone: "${state.bone.name}")`);
    return true;
  }

  /** Detach the model from a slot */
  detach(slot: SlotName): THREE.Group | null {
    const state = this.slots.get(slot);
    if (!state?.attached) return null;

    const model = state.attached;
    state.bone?.remove(model);
    state.attached = null;

    return model;
  }

  /** Detach all equipment */
  detachAll(): void {
    for (const slot of this.slots.keys()) {
      this.detach(slot);
    }
  }

  // ── Query ───────────────────────────────────────────────────────

  /** Get the model currently attached to a slot (null if empty) */
  getAttached(slot: SlotName): THREE.Group | null {
    return this.slots.get(slot)?.attached ?? null;
  }

  /** Check if a slot has a bone available for attachment */
  hasBone(slot: SlotName): boolean {
    return this.slots.get(slot)?.bone != null;
  }

  /** Get all discovered bone names */
  getDiscoveredBones(): Record<SlotName, string | null> {
    const result: Record<string, string | null> = {};
    for (const [slot, state] of this.slots) {
      result[slot] = state.bone?.name ?? null;
    }
    return result as Record<SlotName, string | null>;
  }

  // ── Debug ───────────────────────────────────────────────────────

  getDebugInfo(): string {
    const parts: string[] = [];
    for (const [slot, state] of this.slots) {
      if (state.attached) {
        parts.push(`${slot}:✓`);
      }
    }
    return parts.length > 0 ? parts.join(' ') : 'no equipment';
  }
}
