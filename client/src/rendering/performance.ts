/** Slow, bounded quality changes: brief shader/upload hitches must not lower
 * quality, and recovery needs longer evidence than degradation. No React work
 * or allocations in the per-frame path. */
export class ResolutionBudget {
  readonly max: number;
  ratio: number;
  private elapsed = 0;
  private frames = 0;
  private goodWindows = 0;
  private warmup = 2;
  constructor(deviceRatio: number) {
    this.max = Math.min(1.5, Math.max(1, deviceRatio));
    this.ratio = Math.min(1.25, this.max);
  }
  sample(delta: number): number | null {
    if (delta <= 0 || delta > .25) { this.reset(); return null; }
    if (this.warmup > 0) { this.warmup -= delta; return null; }
    this.elapsed += delta;
    this.frames++;
    if (this.elapsed < 2) return null;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0; this.frames = 0;
    let next = this.ratio;
    if (fps < 52) { next = Math.max(.75, this.ratio - .25); this.goodWindows = 0; }
    else if (fps > 58) {
      if (++this.goodWindows >= 5) { next = Math.min(this.max, this.ratio + .25); this.goodWindows = 0; }
    } else this.goodWindows = 0;
    if (next === this.ratio) return null;
    this.ratio = next;
    this.warmup = 1; // Ignore resize/upload work caused by our own change.
    return next;
  }
  reset() { this.elapsed = 0; this.frames = 0; this.goodWindows = 0; this.warmup = 2; }
}
