// ═══════════════════════════════════════════════════════════════════
// SIMULATOR BASE — Frame-rate independent spring simulation cache
// Ported from Sketchbook (swift502/Sketchbook) — MIT License
//
// The simulator runs at a fixed internal FPS (default 60). Each call
// to simulate() generates however many sub-frames are needed to catch
// up to the real elapsed time, then interpolates between the last two
// cached frames for smooth output at any render framerate.
// ═══════════════════════════════════════════════════════════════════

export abstract class SimulatorBase {
  mass: number;
  damping: number;
  frameTime: number;
  offset: number;
  abstract cache: unknown[];

  constructor(fps: number, mass: number, damping: number) {
    this.mass = mass;
    this.damping = damping;
    this.frameTime = 1 / fps;
    this.offset = 0;
  }

  setFPS(value: number): void {
    this.frameTime = 1 / value;
  }

  lastFrame(): unknown {
    return this.cache[this.cache.length - 1];
  }

  /**
   * Generate frames between last simulation call and the current one.
   * Keeps only the last 2 frames in cache for interpolation.
   */
  generateFrames(timeStep: number): void {
    const totalTimeStep = this.offset + timeStep;
    const framesToGenerate = Math.floor(totalTimeStep / this.frameTime);
    this.offset = totalTimeStep % this.frameTime;

    if (framesToGenerate > 0) {
      for (let i = 0; i < framesToGenerate; i++) {
        this.cache.push(this.getFrame(i + 1 === framesToGenerate));
      }
      this.cache = this.cache.slice(-2);
    }
  }

  abstract getFrame(isLastFrame: boolean): unknown;
  abstract simulate(timeStep: number): void;
}
