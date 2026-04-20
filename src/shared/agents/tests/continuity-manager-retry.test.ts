import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene, Project, Character, Location } from '../../types/index.js';
import { createMockStorageManager } from '../../mocks/mock-storage-manager.js';
import { createMockQualityAgent } from '../../mocks/mock-quality-agent.js';
import { createMockAssetManager } from '../../mocks/mock-asset-manager.js';

const mockStorageManager = createMockStorageManager();
const mockQualityAgent = createMockQualityAgent();
const mockAssetManager = createMockAssetManager();

const mockLlm = {
    generateContent: vi.fn().mockResolvedValue({ text: 'mock prompt' }),
    textModel: 'text-model',
    imageModel: 'image-model',
} as any;

const mockImageModel = {
    generateBatchImages: vi.fn(),
    generateImages: vi.fn(),
    imageModel: 'image-model',
} as any;

const mockFrameComposer = {
    generateFrames: vi.fn(),
    generateFrameGenerationPrompts: vi.fn().mockResolvedValue([]),
} as any;

describe('ContinuityManagerAgent - Retry Logic', () => {
    let continuityAgent: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        process.env.EXECUTION_MODE = 'PARALLEL';
        
        const { ContinuityManagerAgent } = await import('../continuity-manager.js');
        
        // @ts-ignore - constructor signature mismatch with test setup
        continuityAgent = new ContinuityManagerAgent(
            mockLlm as any,
            mockImageModel as any,
            mockQualityAgent as any,
            mockStorageManager as any,
            mockAssetManager as any
        );
    });

    afterEach(() => {
        delete process.env.EXECUTION_MODE;
    });

    describe('generateCharacterAssets', () => {
        it('should retry failed batch items', async () => {
            const characters: Character[] = [
                { id: 'char1', projectId: 'p1', name: 'Char 1', physicalTraits: {} } as any,
                { id: 'char2', projectId: 'p1', name: 'Char 2', physicalTraits: {} } as any,
            ];

            // Mock first attempt: char1 success, char2 fail
            const error429 = new Error('Rate limit');
            (error429 as any).status = 429;
            
            let callCount = 0;
            mockImageModel.generateBatchImages.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    return [
                        { customId: 'char1', version: 1, status: 'SUCCESS', imageBytes: 'base64' },
                        { customId: 'char2', version: 1, status: 'FAILED', error: error429 }
                    ];
                }
                if (callCount === 2) {
                    return [
                        { customId: 'char2', version: 1, status: 'SUCCESS', imageBytes: 'base64' }
                    ];
                }
                return [];
            });

            const saveAssets = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn().mockResolvedValue(undefined);

            await continuityAgent.generateCharacterAssets(
                characters,
                [],
                saveAssets,
                incrementAttempt,
                recordMetrics
            );

            // Expect 2 calls to generateBatchImages
            expect(mockImageModel.generateBatchImages).toHaveBeenCalledTimes(2);
            
            // First call should have both
            expect(mockImageModel.generateBatchImages.mock.calls[0][0].requests).toHaveLength(2);
            
            // Second call should have only char2
            expect(mockImageModel.generateBatchImages.mock.calls[1][0].requests).toHaveLength(1);
            expect(mockImageModel.generateBatchImages.mock.calls[1][0].requests[0].metadata.custom_id).toBe('char2');
        });

        it('should handle characters without existing assets', async () => {
            const characters: Character[] = [
                { id: 'char1', projectId: 'p1', name: 'Char 1', physicalTraits: {} } as any
            ];

            // Mock no existing assets
            mockAssetManager.getBestVersion.mockResolvedValue([]);

            // Mock successful generation
            mockImageModel.generateBatchImages.mockResolvedValue([
                { customId: 'char1', version: 1, status: 'SUCCESS', imageBytes: 'base64' }
            ]);

            const saveAssets = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn().mockResolvedValue(undefined);

            await continuityAgent.generateCharacterAssets(
                characters,
                [],
                saveAssets,
                incrementAttempt,
                recordMetrics
            );

            // Should have called saveAssets
            expect(saveAssets).toHaveBeenCalled();
        });
    });

    describe('generateLocationAssets', () => {
        it('should handle location asset generation', async () => {
            const locations: Location[] = [
                { id: 'loc1', projectId: 'p1', name: 'Loc 1', weather: 'sunny', description: 'A sunny beach', lightingConditions: { atmosphere: { haze: 'None' }, direction: { contrastRatio: '', keyLightPosition: '', shadowDirection: '' }, motivatedSources: { primaryLight: '', fillLight: '', practicalLights: '', accentLight: '', lightBeams: '' }, quality: { hardness: 'Soft', colorTemperature: 'Neutral', intensity: 'Medium' } }, state: { precipitation: 'none', visibility: 'clear', groundCondition: { wetness: 'dry', debris: [], damage: [] }, temperatureIndicators: [], atmosphericEffects: [] } } as any,
                { id: 'loc2', projectId: 'p1', name: 'Loc 2', weather: 'rainy', description: 'A rainy city', lightingConditions: { atmosphere: { haze: 'Light mist' }, direction: { contrastRatio: 'Medium(1: 4)', keyLightPosition: 'Front - left, right 45°', shadowDirection: 'Falling left' }, motivatedSources: { primaryLight: 'Street lamp', fillLight: 'Ambient skylight', practicalLights: 'Neon signs', accentLight: 'Rim light from behind', lightBeams: 'None' }, quality: { hardness: 'Hard', colorTemperature: 'Cool', intensity: 'High' } }, state: { precipitation: 'light', visibility: 'clear', groundCondition: { wetness: 'wet', debris: [], damage: [] }, temperatureIndicators: [], atmosphericEffects: [] } } as any
            ];

            // Mock successful batch generation
            mockImageModel.generateBatchImages.mockResolvedValue([
                { customId: 'loc1', version: 1, status: 'SUCCESS', imageBytes: 'base64' },
                { customId: 'loc2', version: 1, status: 'SUCCESS', imageBytes: 'base64' }
            ]);

            const saveAssets = vi.fn();
            const incrementAttempt = vi.fn();
            const recordMetrics = vi.fn().mockResolvedValue(undefined);

            // Should not throw
            await expect(continuityAgent.generateLocationAssets(
                locations,
                [],
                saveAssets,
                incrementAttempt,
                recordMetrics
            )).resolves.not.toThrow();
        });
    });
});
