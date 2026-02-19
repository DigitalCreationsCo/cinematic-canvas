import { describe, it, expect } from 'vitest';
import { buildGenerateContentParams } from './params';
describe('buildGenerateContentParams', () => {
    it('should remove unsupported features using exact wildcard matching', () => {
        const input = {
            model: "gemini-2.5-pro",
            contents: [ {
                parts: [ { text: "hello", mediaResolution: "high" } ]
            } ]
        };

        const result = buildGenerateContentParams(input);

        expect(result.contents[ 0 ].parts[ 0 ]).not.toHaveProperty('mediaResolution');
        expect(result.contents[ 0 ].parts[ 0 ].text).toBe("hello");
    });

    it('should remove features from multiple matching patterns', () => {
        const input = {
            model: "gemini-2.5-flash", // Matches both patterns
            contents: [ {
                parts: [ { mediaResolution: "val", lowLatency: true, other: "stay" } ]
            } ]
        };

        const result = buildGenerateContentParams(input);
        const part = result.contents[ 0 ].parts[ 0 ];

        expect(part).not.toHaveProperty('mediaResolution');
        expect(part).not.toHaveProperty('lowLatency');
        expect(part.other).toBe("stay");
    });

    it('should return a full clone and not mutate the original input', () => {
        const input = {
            model: "gemini-2.5-pro",
            contents: [ { parts: [ { mediaResolution: "hide" } ] } ]
        };

        const result = buildGenerateContentParams(input);

        // Verification of immutability
        expect(result).not.toBe(input);
        expect(input.contents[ 0 ].parts[ 0 ]).toHaveProperty('mediaResolution');
        expect(result.contents[ 0 ].parts[ 0 ]).not.toHaveProperty('mediaResolution');
    });

    it('should handle models with no unsupported features', () => {
        const input = {
            model: "gemini-1.0-ultra",
            contents: [ { parts: [ { mediaResolution: "keep" } ] } ]
        };

        const result = buildGenerateContentParams(input);
        expect(result.contents[ 0 ].parts[ 0 ].mediaResolution).toBe("keep");
    });

    it('should handle contents with missing parts safely', () => {
        const input = {
            model: "gemini-2.5-pro",
            contents: [ { text: "no parts here" } ]
        };

        const result = buildGenerateContentParams(input);
        expect(result.contents[ 0 ]).toHaveProperty('text', 'no parts here');
        expect(result.contents[ 0 ].parts).toBeUndefined();
    });

    it('should correctly escape special regex characters in pattern names', () => {
        // Test that the logic handles a literal '.' in "2.5" and doesn't treat it as a regex wildcard
        const input = {
            model: "gemini-2X5-pro", // Should NOT match "gemini-2.5-*"
            contents: [ { parts: [ { mediaResolution: "should-stay" } ] } ]
        };

        const result = buildGenerateContentParams(input);
        expect(result.contents[ 0 ].parts[ 0 ].mediaResolution).toBe("should-stay");
    });
});
