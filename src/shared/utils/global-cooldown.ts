/**
 * Global cooldown manager to throttle function calls across all invocations.
 */
export class GlobalCooldown {
  private static lastCallTimestamp = 0;
  private static cooldownMs = 2000; // Configurable base throttle - increased to mitigate 429s

  static async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTimestamp;
    if (elapsed < this.cooldownMs) {
      const waitMs = this.cooldownMs - elapsed;
      console.log(`Global cooldown active: waiting ${waitMs}ms`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }

  static markCallComplete(): void {
    this.lastCallTimestamp = Date.now();
  }

  static setCooldownMs(ms: number): void {
    this.cooldownMs = ms;
  }

  static getCooldownMs(): number {
    return this.cooldownMs;
  }
}
