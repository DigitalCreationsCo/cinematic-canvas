/**
 * Global cooldown manager to throttle function calls across all invocations.
 *
 * ⚠️ Concurrency-safe design:
 * The timestamp is claimed INSIDE wait() (pre-call), NOT in markCallComplete()
 * (post-call). This ensures concurrent callers each see an updated timestamp and
 * naturally serialize — caller A claims t₁, caller B sees t₁ and waits cooldownMs,
 * claims t₂, etc. Without this, Promise.all(batch) would read the same stale
 * timestamp, compute the same delay, and all fire simultaneously.
 */
export class GlobalCooldown {
  private static lastCallTimestamp = 0;
  private static cooldownMs = 2000; // Configurable base throttle

  static async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTimestamp;
    if (elapsed < this.cooldownMs) {
      const waitMs = this.cooldownMs - elapsed;
      console.log(`Global cooldown active: waiting ${waitMs}ms`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
    // Claim the slot immediately so concurrent callers see the updated timestamp.
    // This serializes concurrent requests without needing per-call-site staggering.
    this.lastCallTimestamp = Date.now();
  }

  /** Retained for API compat — timestamp is now claimed in wait(). */
  static markCallComplete(): void {}

  static setCooldownMs(ms: number): void {
    this.cooldownMs = ms;
  }

  static getCooldownMs(): number {
    return this.cooldownMs;
  }
}
