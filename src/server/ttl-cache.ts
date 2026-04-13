// src/server/ttl-cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generic in-process TTL cache.
//
// Design goals: simple, zero-dependency, safe for single-process use.
// Not a distributed cache — each server instance maintains its own store.
// For the active-jobs REST endpoint this is sufficient: the SSE stream
// delivers real-time updates, so a short TTL on the hydration endpoint is
// all that's needed.
//
// Extensibility hooks:
//   • Pass a custom `onEvict` callback to the constructor to react to evictions
//     (e.g. metrics, cascading invalidations).
//   • Call `prune()` on a timer to eagerly release expired entries and keep
//     the Map from growing without bound in long-running processes.
// ─────────────────────────────────────────────────────────────────────────────

export interface TtlCacheOptions<V> {
    /** Called when an entry expires or is explicitly invalidated. */
    onEvict?: (key: string, value: V) => void;
}

export class TtlCache<V> {
    private readonly store = new Map<string, { value: V; expiresAt: number }>();
    private readonly onEvict?: (key: string, value: V) => void;

    constructor(opts: TtlCacheOptions<V> = {}) {
        this.onEvict = opts.onEvict;
    }

    /**
     * Returns the cached value for `key`, or `undefined` if absent or expired.
     * Expired entries are lazily evicted on access.
     */
    get(key: string): V | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            this.onEvict?.(key, entry.value);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Stores `value` under `key` with the given TTL.
     * Replaces any existing entry for the same key.
     */
    set(key: string, value: V, ttlMs: number): void {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }

    /**
     * Immediately removes the entry for `key` (if present) and fires onEvict.
     */
    invalidate(key: string): void {
        const entry = this.store.get(key);
        if (entry) {
            this.store.delete(key);
            this.onEvict?.(key, entry.value);
        }
    }

    /** Removes all entries regardless of TTL. */
    clear(): void {
        this.store.clear();
    }

    /**
     * Eagerly evicts all expired entries.
     * Call this on a periodic timer in long-running processes to avoid
     * unbounded Map growth when many distinct keys are cached.
     *
     * Example:
     *   setInterval(() => cache.prune(), 60_000);
     */
    prune(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
                this.onEvict?.(key, entry.value);
            }
        }
    }

    /** Number of entries currently in the store (including possibly-expired ones). */
    get size(): number {
        return this.store.size;
    }
}