import { ASSET_TYPE_MAP, AssetHistory, AssetKey, AssetRegistry, AssetVersion } from "#shared/types/assets.types.js";
import { vi, Mocked } from "vitest";

/**
 * Creates a mocked instance of a class where all prototype methods are 
 * vitest mock functions. Uses a Proxy to recursively handle nested properties,
 * making it ideal for SDKs with deep namespaces (e.g., GoogleGenAI).
 * * @template T
 * @param {new (...args: any[]) => T} Class - The class constructor to mock.
 * @returns {import('vitest').Mocked<T>} A proxy-wrapped mock instance.
 */
export const automockClass = <T extends object>(Class: new (...args: any[]) => T): Mocked<T> => {
    const mock = {} as any;

    const methods = Object.getOwnPropertyNames(Class.prototype).filter(
        (key) => key !== 'constructor' && typeof Class.prototype[key] === 'function'
    );

    methods.forEach((key) => {
        mock[key] = vi.fn().mockResolvedValue(undefined);
    });

    return new Proxy(mock, {
        get: (target, prop) => {
            if (prop in target) return target[prop];
            if (prop === 'then') return undefined;

            target[prop] = createDeepMock();
            return target[prop];
        }
    }) as Mocked<T>;
};

/**
 * Creates a recursive proxy that automatically generates vitest mocks 
 * for any property accessed. Perfect for mocking deeply nested objects 
 * like tRPC clients or complex configuration objects.
 * * @template T
 * @returns {T} A recursive proxy that returns mock functions at every leaf.
 */
export const createDeepMock = <T extends object>(): T => {
    const cache = new Map<string | symbol, any>();

    return new Proxy({} as T, {
        get: (target, prop) => {
            // Prevent Vitest/Promises from hanging on 'then' checks
            if (prop === 'then') return undefined;

            if (!cache.has(prop)) {
                // Create a mock function that defaults to resolving undefined
                const mockFn = vi.fn().mockResolvedValue(undefined);

                // Wrap the mock function in another proxy to allow further nesting
                // This handles: trpcClient.projects (proxy) -> .create (proxy) -> .mutate (mockFn)
                cache.set(prop, new Proxy(mockFn, {
                    get: (fnTarget, subProp) => {
                        // If accessing vitest methods (mockResolvedValue, etc), return them
                        if (subProp in fnTarget || typeof subProp === 'symbol') {
                            return (fnTarget as any)[subProp];
                        }
                        // Otherwise, keep nesting deeper
                        return createDeepMock();
                    }
                }));
            }
            return cache.get(prop);
        },
    });
};

export interface KVAssetsMap extends Partial<Record<AssetKey, string | string[]>> { }

/**
 * Transforms a simplified Key-Value map into a structured AssetRegistry.
 * * This helper is primarily used for mocking or initializing state from flat data.
 * It handles polymorphic values (string or string[]), normalizes them into 
 * versioned history, and maps the internal AssetType based on the provided key.
 * * @param {Record<string, string | string[]>} kvAssetMap - A map where keys are {@link AssetKey} 
 * and values are either a single data string or an array of data strings.
 * * @returns {AssetRegistry} A registry object where:
 * - Each key contains an {@link AssetHistory}.
 * - Versions are 1-indexed based on their position in the input array.
 * - `head` and `best` are automatically set to the latest version.
 * - `type` is resolved via the {@link ASSET_TYPE_MAP}.
 * * @example
 * const registry = buildAssetRegistryFromMockKV({
 * description: "A sunny day",
 * scene_video: ["uri_v1", "uri_v2"]
 * });
 */
export const buildAssetRegistryFromMockKV = (kvAssetMap: KVAssetsMap): AssetRegistry => {
    return Object.entries(kvAssetMap).reduce((acc: AssetRegistry, [key, rawValues]) => {
        const values = Array.isArray(rawValues) ? rawValues : [rawValues];

        const history: AssetHistory = {
            head: 0,
            best: 0,
            versions: []
        };

        values.forEach((content, index) => {
            const versionNumber = index + 1;

            const newVersion: AssetVersion = {
                version: versionNumber,
                data: content,
                type: ASSET_TYPE_MAP[key as AssetKey] ?? 'text',
                metadata: {},
                startedAt: new Date(),
                createdAt: new Date(),
            };

            history.versions.push(newVersion);

            // Increment head to the latest version
            history.head = versionNumber;

            // Update best (assuming the latest is 'best' for this mock conversion)
            history.best = versionNumber;
        });

        acc[key as AssetKey] = history;
        return acc;
    }, {} as AssetRegistry);
};