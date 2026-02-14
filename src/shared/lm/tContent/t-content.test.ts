/**
 * content-utils.test.ts
 * Vitest suite for 100% coverage of content-utils.ts
 */
import { describe, it, expect } from 'vitest';
import {
    normalizePart,
    normalizeParts,
    normalizeContent,
    normalizeContents,
    type Content,
    type Part,
} from './t-content';

describe('Content Utils', () => {
    // --- normalizePart ---
    describe('normalizePart', () => {
        it('should throw if input is null or undefined', () => {
            expect(() => normalizePart(null)).toThrow('Part input is required');
            expect(() => normalizePart(undefined)).toThrow('Part input is required');
        });

        it('should convert string to text part', () => {
            const result = normalizePart('hello');
            expect(result).toEqual({ text: 'hello' });
        });

        it('should return existing Part object as is', () => {
            const part: Part = { text: 'existing', inlineData: { mimeType: 'img/png', data: '123' } };
            const result = normalizePart(part);
            expect(result).toBe(part); // Referentially equal
        });

        it('should throw on unsupported types (e.g. number)', () => {
            // @ts-ignore - testing runtime validation
            expect(() => normalizePart(123)).toThrow('Unsupported part type: number');
        });
    });

    // --- normalizeParts ---
    describe('normalizeParts', () => {
        it('should throw if input is null, undefined, or empty array', () => {
            expect(() => normalizeParts(null)).toThrow('PartList input is required');
            expect(() => normalizeParts([])).toThrow('PartList input is required');
        });

        it('should handle single string', () => {
            const result = normalizeParts('hello');
            expect(result).toEqual([ { text: 'hello' } ]);
        });

        it('should handle single part object', () => {
            const part = { text: 'hi' };
            const result = normalizeParts(part);
            expect(result).toEqual([ part ]);
        });

        it('should handle array of strings', () => {
            const result = normalizeParts([ 'a', 'b' ]);
            expect(result).toEqual([ { text: 'a' }, { text: 'b' } ]);
        });

        it('should handle array of mixed strings and parts', () => {
            const result = normalizeParts([ 'a', { text: 'b' } ]);
            expect(result).toEqual([ { text: 'a' }, { text: 'b' } ]);
        });
    });

    // --- normalizeContent ---
    describe('normalizeContent', () => {
        it('should throw if input is missing', () => {
            expect(() => normalizeContent(undefined)).toThrow('Content input is required');
        });

        it('should return valid Content object as is', () => {
            const content: Content = { role: 'model', parts: [ { text: 'response' } ] };
            const result = normalizeContent(content);
            expect(result).toEqual(content);
        });

        it('should wrap simple string in user content', () => {
            const result = normalizeContent('prompt');
            expect(result).toEqual({ role: 'user', parts: [ { text: 'prompt' } ] });
        });

        it('should wrap array of parts in user content', () => {
            const parts = [ 'a', { text: 'b' } ];
            const result = normalizeContent(parts);
            expect(result).toEqual({ role: 'user', parts: [ { text: 'a' }, { text: 'b' } ] });
        });
    });

    // --- normalizeContents ---
    describe('normalizeContents', () => {
        // 1. Validation basics
        it('should throw if input is missing or empty array', () => {
            expect(() => normalizeContents(undefined)).toThrow('Contents are required');
            expect(() => normalizeContents([])).toThrow('Contents are required');
        });

        // 2. Single item handling (Non-array input)
        it('should normalize a single string into a Content array', () => {
            const result = normalizeContents('hello');
            expect(result).toEqual([ { role: 'user', parts: [ { text: 'hello' } ] } ]);
        });

        it('should normalize a single Part into a Content array', () => {
            const result = normalizeContents({ text: 'hello' });
            expect(result).toEqual([ { role: 'user', parts: [ { text: 'hello' } ] } ]);
        });

        it('should normalize a single Content object into a Content array', () => {
            const content: Content = { role: 'model', parts: [ { text: 'hi' } ] };
            const result = normalizeContents(content);
            expect(result).toEqual([ content ]);
        });

        it('should throw if naked functionCall part is passed as single input', () => {
            const fcPart = { functionCall: { name: 'foo', args: {} } };
            expect(() => normalizeContents(fcPart as any)).toThrow(
                'To specify functionCall or functionResponse parts, please wrap them in a Content object'
            );
        });

        // 3. Array handling - Homogeneous
        it('should normalize an array of strings into one User Content block', () => {
            const result = normalizeContents([ 'a', 'b' ]);
            expect(result).toEqual([
                { role: 'user', parts: [ { text: 'a' }, { text: 'b' } ] }
            ]);
        });

        it('should normalize an array of Parts into one User Content block', () => {
            const result = normalizeContents([ { text: 'a' }, { text: 'b' } ]);
            expect(result).toEqual([
                { role: 'user', parts: [ { text: 'a' }, { text: 'b' } ] }
            ]);
        });

        it('should normalize an array of Content objects (pass-through)', () => {
            const inputs: Content[] = [
                { role: 'user', parts: [ { text: 'Q' } ] },
                { role: 'model', parts: [ { text: 'A' } ] }
            ];
            const result = normalizeContents(inputs);
            expect(result).toEqual(inputs);
        });

        // 4. Array handling - Heterogeneous/Edge cases
        it('should throw when mixing Content objects and raw Parts/Strings in top-level array', () => {
            const mixed = [
                { role: 'user', parts: [ { text: 'proper content' } ] },
                'raw string'
            ];
            expect(() => normalizeContents(mixed as any)).toThrow(
                'Mixing Content objects and Parts/Strings'
            );
        });

        it('should throw when mixing raw Parts and Content objects (reverse order)', () => {
            const mixed = [
                'raw string',
                { role: 'user', parts: [ { text: 'proper content' } ] }
            ];
            expect(() => normalizeContents(mixed as any)).toThrow(
                'Mixing Content objects and Parts/Strings'
            );
        });

        it('should throw if array contains unwrapped functionCall parts', () => {
            const input = [
                { text: 'some context' },
                { functionCall: { name: 'exec', args: {} } }
            ];
            expect(() => normalizeContents(input as any)).toThrow(
                'To specify functionCall or functionResponse parts'
            );
        });
    });
});