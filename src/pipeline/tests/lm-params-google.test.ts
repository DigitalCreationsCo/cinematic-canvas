import { describe, it, expect } from 'vitest';
import { buildGenerateContentParams, buildGenerateImagesParams, buildGenerateVideosParams } from '../../shared/lm/google/params.js';
import { Modality, HarmCategory, HarmBlockThreshold, HarmBlockMethod } from '@google/genai';
import { textModelName, imageModelName, videoModelName } from '../../shared/lm/google/models.js';

describe('LLM Parameter Builders', () => {
    describe('buildGenerateTextParams', () => {
        it('should merge default and provided parameters correctly', () => {
            const params = {
                contents: [ { role: 'user', parts: [ { text: 'hello' } ] } ],
                config: {
                    temperature: 0.5,
                },
            };
            const result = buildGenerateContentParams(params);
            expect(result.model).toBe(textModelName);
            expect(result.contents).toEqual(params.contents);
            expect(result.config).toEqual({
                candidateCount: 1,
                responseMimeType: "application/json",
                responseModalities: [ Modality.TEXT ],
                safetySettings: [
                    {
                        category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
                        threshold: HarmBlockThreshold.OFF,
                        method: HarmBlockMethod.HARM_BLOCK_METHOD_UNSPECIFIED,
                    },
                ],
                temperature: 0.5,
            });
        });
    });

    describe('buildGenerateImagesParams', () => {
        it('should merge default and provided parameters correctly', () => {
            const params = {
                prompt: 'a cat',
                referenceImages: []
            };
            const result = buildGenerateImagesParams(params);
            expect(result.model).toBe(imageModelName);
            expect(result.prompt).toBe('a cat');
        });
    });

    describe('buildGenerateVideosParams', () => {
        it('should merge default and provided parameters correctly', () => {
            const params = {
                prompt: 'a dog running',
            };
            const result = buildGenerateVideosParams(params);
            expect(result.model).toBe(videoModelName);
            expect(result.prompt).toBe('a dog running');
        });
    });
});
