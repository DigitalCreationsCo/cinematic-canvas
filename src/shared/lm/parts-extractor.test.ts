import { describe, it, expect } from 'vitest';
import { extractGeneratedResponse, universalTextExtractor } from './parts-extractor.js';
import { GenerateContentResponse } from './provider.js';

describe('universalTextExtractor', () => {
    it('should extract text from a standard Google response', () => {
        const mockResponse = {
            candidates: [{ content: { parts: [{ text: "Scene 1: Interior" }] } }]
        };
        const result = universalTextExtractor(mockResponse as any, 'google');
        expect(result).toEqual(["Scene 1: Interior"]);
    });

    it('should throw error when parts are missing or undefined', () => {
        const mockResponse = { candidates: [{ content: { parts: [] } }] };
        expect(() => universalTextExtractor(mockResponse as any, 'google')).toThrow();
    });
});

describe('LLM Data Extraction Suite', () => {

    it('extracts inlineData from Google Vertex/AI Studio responses', () => {
        const googleResponse = {
            candidates: [{
                content: {
                    parts: [{
                        inlineData: {
                            data: 'base64_encoded_image_data',
                            mimeType: 'image/png'
                        }
                    }]
                }
            }]
        };

        const result = extractGeneratedResponse("image", googleResponse as GenerateContentResponse, 'google');
        expect(result).includes('base64_encoded_image_data');
    });

    it('falls back to text for Google responses when inlineData is missing', () => {
        const googleTextResponse = {
            candidates: [{
                content: {
                    parts: [{ text: 'Hello world' }]
                }
            }]
        };

        const result = extractGeneratedResponse("text", googleTextResponse as GenerateContentResponse, 'google');
        expect(result).includes('Hello world');
    });

    // it('handles OpenAI chat completion format', () => {
    //     const openaiResponse = {
    //         choices: [ {
    //             message: { content: 'OpenAI response text' }
    //         } ]
    //     };

    //     const result = extractGeneratedResponse("text", openaiResponse as GenerateContentResponse, 'openai');
    //     expect(result).toBe('OpenAI response text');
    // });

    it('gracefully handles malformed or empty objects', () => {
        const emptyResponse = {};

        expect(extractGeneratedResponse("text", emptyResponse as GenerateContentResponse, 'google')).toEqual([]);
        expect(extractGeneratedResponse("text", null as unknown as GenerateContentResponse, 'google')).toEqual([]);
    });
});