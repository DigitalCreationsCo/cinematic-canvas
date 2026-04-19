import { describe, it, expect } from 'vitest';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { buildGenerateContentParams } from './params';
import { validateInputBySupportedModelFeatures } from './utils';

// ─── buildGenerateContentParams ──────────────────────────────────────────────
//
// These tests verify the full pipeline:
//   BaseMessage[]  →  convertMessagesToGoogle  →  validateInput  →  config defaults
//
// mediaResolution stripping is tested separately against validateInputBySupportedModelFeatures
// because LangChain messages carry no Google-specific part fields — the stripping
// occurs after conversion on internal Content[], which is tested directly below.

describe('Message Inputs: ', () => {

    it('image file input parameters are retained after conversion to google contents', () => { });
    it('audio file input parameters are retained after conversion to google contents', () => { });
    it('video file input parameters are retained after conversion to google contents', () => { });
    it('text input parameters are retained after conversion to google contents', () => { });
});

describe('buildGenerateContentParams', () => {

    it('converts a HumanMessage to a user content turn', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [new HumanMessage('hello')],
        });

        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[0].parts[0]).toMatchObject({ text: 'hello' });
    });

    it('extracts a SystemMessage as systemInstruction, not a content turn', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [
                new SystemMessage('You are a helpful assistant.'),
                new HumanMessage('What is 2+2?'),
            ],
        });

        // SystemMessage must NOT appear in contents
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].role).toBe('user');

        // SystemMessage IS surfaced as systemInstruction in config
        expect((result.config as any).systemInstruction).toBe('You are a helpful assistant.');
    });

    it('converts an AIMessage to a model content turn', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [
                new HumanMessage('Hi'),
                new AIMessage('Hello! How can I help?'),
            ],
        });

        expect(result.contents).toHaveLength(2);
        expect(result.contents[1].role).toBe('model');
        expect(result.contents[1].parts[0]).toMatchObject({ text: 'Hello! How can I help?' });
    });

    it('applies default config values', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [new HumanMessage('test')],
        });

        expect(result.config).toMatchObject({
            candidateCount: 1,
            responseMimeType: 'application/json',
        });
        expect(Array.isArray(result.config?.safetySettings)).toBe(true);
    });

    it('caller config overrides defaults — e.g. responseMimeType for tool calls', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [new HumanMessage('test')],
            config: {
                // Chat/tool-call paths must override JSON mode or ToolNode breaks
                responseMimeType: 'text/plain',
            },
        });

        expect(result.config?.responseMimeType).toBe('text/plain');
    });

    it('preserves abortSignal from input config', () => {
        const controller = new AbortController();
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [new HumanMessage('test')],
            config: { abortSignal: controller.signal },
        });

        expect(result.config?.abortSignal).toBe(controller.signal);
    });

    it('produces an immutable result — does not mutate the original messages array', () => {
        const messages = [new HumanMessage('hello')];
        const messagesBefore = [...messages];

        buildGenerateContentParams({ model: 'gemini-2.5-pro', messages });

        expect(messages).toEqual(messagesBefore);
    });

    it('handles multiple HumanMessages in sequence', () => {
        const result = buildGenerateContentParams({
            model: 'gemini-2.5-pro',
            messages: [
                new HumanMessage('first'),
                new AIMessage('response'),
                new HumanMessage('second'),
            ],
        });

        expect(result.contents).toHaveLength(3);
        expect(result.contents[0].role).toBe('user');
        expect(result.contents[1].role).toBe('model');
        expect(result.contents[2].role).toBe('user');
    });
});

// ─── validateInputBySupportedModelFeatures ───────────────────────────────────
//
// This utility operates on Google Content[] (post-conversion) and strips
// unsupported part fields based on model wildcard patterns.
// It is tested directly here because the stripping is a Google-internal concern
// that cannot be exercised through the LangChain message public interface.

describe('validateInputBySupportedModelFeatures', () => {

    it('removes unsupported features using exact wildcard matching', () => {
        const input = {
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ text: 'hello', mediaResolution: 'high' }] }],
        };

        const result = validateInputBySupportedModelFeatures(input);

        expect(result.contents[0].parts[0]).not.toHaveProperty('mediaResolution');
        expect(result.contents[0].parts[0].text).toBe('hello');
    });

    it('removes features from multiple matching wildcard patterns', () => {
        const input = {
            model: 'gemini-2.5-flash', // matches both wildcard patterns in modelsUnsupportedFeatures
            contents: [{ parts: [{ mediaResolution: 'val', lowLatency: true, other: 'stay' }] }],
        };

        const result = validateInputBySupportedModelFeatures(input);
        const part = result.contents[0].parts[0];

        expect(part).not.toHaveProperty('mediaResolution');
        expect(part).not.toHaveProperty('lowLatency');
        expect((part as any).other).toBe('stay');
    });

    it('returns a deep clone — does not mutate the original input', () => {
        const input = {
            model: 'gemini-2.5-pro',
            contents: [{ parts: [{ mediaResolution: 'hide' }] }],
        };

        const result = validateInputBySupportedModelFeatures(input);

        expect(result).not.toBe(input);
        // Original must be untouched
        expect(input.contents[0].parts[0]).toHaveProperty('mediaResolution');
        // Clone must have the field stripped
        expect(result.contents[0].parts[0]).not.toHaveProperty('mediaResolution');
    });

    it('leaves contents unchanged for models with no unsupported features', () => {
        const input = {
            model: 'gemini-1.0-ultra',
            contents: [{ parts: [{ mediaResolution: 'keep' }] }],
        };

        const result = validateInputBySupportedModelFeatures(input);
        expect((result.contents[0].parts[0] as any).mediaResolution).toBe('keep');
    });

    it('handles content entries with no parts property safely', () => {
        const input = {
            model: 'gemini-2.5-pro',
            contents: [{ text: 'no parts here' } as any],
        };

        const result = validateInputBySupportedModelFeatures(input);
        expect(result.contents[0]).toHaveProperty('text', 'no parts here');
        expect((result.contents[0] as any).parts).toBeUndefined();
    });

    it('escapes special regex characters — "2.5" dot is literal, not a wildcard', () => {
        // "gemini-2X5-pro" should NOT match the "gemini-2.5-*" pattern
        const input = {
            model: 'gemini-2X5-pro',
            contents: [{ parts: [{ mediaResolution: 'should-stay' }] }],
        };

        const result = validateInputBySupportedModelFeatures(input);
        expect((result.contents[0].parts[0] as any).mediaResolution).toBe('should-stay');
    });
});