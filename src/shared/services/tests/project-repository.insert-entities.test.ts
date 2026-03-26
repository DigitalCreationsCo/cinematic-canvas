import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectRepository } from '../project-repository.js';

const mockDb = {
  query: {
    scenes: { findMany: vi.fn().mockResolvedValue([]) },
    characters: { findMany: vi.fn().mockResolvedValue([]) },
    locations: { findMany: vi.fn().mockResolvedValue([]) },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  })),
  delete: vi.fn(() => ({
    where: vi.fn().mockResolvedValue([]),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
  })),
  transaction: vi.fn(async (cb) => {
    const txMock = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    };
    return cb(txMock);
  }),
};

vi.mock('../db/index.js', () => ({ db: mockDb }));

describe('ProjectRepository.insertEntities', () => {
  let repo: ProjectRepository;
  const projectId = '0192f8c0-7b70-7e40-b1c0-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new ProjectRepository();
  });

  it('should reject character with missing required name field', async () => {
    await expect(
      repo.insertEntities(projectId, [
        {
          entityType: 'character' as const,
          entityId: 'ent-1',
          data: {
            referenceId: 'char-ref-1',
            aliases: [],
            physicalTraits: {
              hair: '',
              clothing: [],
              accessories: [],
              distinctiveFeatures: [],
              build: 'average',
              ethnicity: '',
              age: '25',
              gender: 'male' as const,
              appearanceNotes: [],
            },
            state: {},
          },
        },
      ])
    ).rejects.toThrow();
  });

  it('should reject character with invalid gender value', async () => {
    await expect(
      repo.insertEntities(projectId, [
        {
          entityType: 'character' as const,
          entityId: 'ent-1',
          data: {
            name: 'Test',
            referenceId: 'char-ref-1',
            aliases: [],
            physicalTraits: {
              hair: '',
              clothing: [],
              accessories: [],
              distinctiveFeatures: [],
              build: 'average',
              ethnicity: '',
              age: '25',
              gender: 'invalid' as any,
              appearanceNotes: [],
            },
            state: {},
          },
        },
      ])
    ).rejects.toThrow();
  });

  it('should reject character with non-uuid projectId', async () => {
    await expect(
      repo.insertEntities('invalid-project-id', [
        {
          entityType: 'character' as const,
          entityId: 'ent-1',
          data: {
            name: 'Test',
            referenceId: 'char-ref-1',
            aliases: [],
            physicalTraits: {
              hair: '',
              clothing: [],
              accessories: [],
              distinctiveFeatures: [],
              build: 'average',
              ethnicity: '',
              age: '25',
              gender: 'male' as const,
              appearanceNotes: [],
            },
            state: {},
          },
        },
      ])
    ).rejects.toThrow();
  });

  it('should reject location with missing required name field', async () => {
    await expect(
      repo.insertEntities(projectId, [
        {
          entityType: 'location' as const,
          entityId: 'ent-1',
          data: {
            referenceId: 'loc-ref-1',
            type: 'Indoor',
            mood: 'Neutral',
            lightingConditions: {
              quality: { hardness: 'Soft', colorTemperature: 'Neutral', intensity: 'Medium' },
              motivatedSources: { primaryLight: '', fillLight: '', practicalLights: '', accentLight: '', lightBeams: '' },
              direction: { keyLightPosition: '', shadowDirection: '', contrastRatio: '' },
              atmosphere: { haze: 'None' },
            },
            timeOfDay: 'Day',
            weather: 'Clear',
            colorPalette: [],
            architecture: [],
            naturalElements: [],
            manMadeObjects: [],
            groundSurface: 'Floor',
            skyOrCeiling: 'Ceiling',
            state: {},
          },
        },
      ])
    ).rejects.toThrow();
  });

  it('should reject scene with missing required fields', async () => {
    await expect(
      repo.insertEntities(projectId, [
        {
          entityType: 'scene' as const,
          entityId: 'ent-1',
          data: {
            name: 'Test Scene',
          },
        },
      ])
    ).rejects.toThrow();
  });

  it('should reject scene with invalid transitionType', async () => {
    await expect(
      repo.insertEntities(projectId, [
        {
          entityType: 'scene' as const,
          entityId: 'ent-1',
          data: {
            name: 'Test Scene',
            description: 'Test',
            mood: 'Neutral',
            audioSync: 'Mood Sync',
            locationId: 'loc-1',
            locationReferenceId: 'loc-ref-1',
            characterIds: [],
            characterReferenceIds: [],
            continuityNotes: [],
            transitionType: 'InvalidTransition' as any,
            shotType: 'Medium Shot' as const,
            cameraAngle: 'Eye Level' as const,
            cameraMovement: 'Static' as const,
            composition: {
              'Subject Placement': 'Center',
              'Focal Point': 'Center',
              'Depth Layers': 'Foreground',
              'Leading Lines': 'None',
              'Headroom': 'Standard',
              'Look Room': 'None',
            },
            lighting: {
              quality: { hardness: 'Soft', colorTemperature: 'Neutral', intensity: 'Medium' },
              motivatedSources: { primaryLight: '', fillLight: '', practicalLights: '', accentLight: '', lightBeams: '' },
              direction: { keyLightPosition: '', shadowDirection: '', contrastRatio: '' },
              atmosphere: { haze: 'None' },
            },
            startTime: 0,
            endTime: 10,
            duration: 10,
            type: 'lyrical' as const,
            audioEvidence: 'Dialog',
            transientImpact: 'none' as const,
            tempo: 'moderate' as const,
            lyrics: '',
            musicalDescription: '',
            musicChange: '',
            intensity: 'medium' as const,
            status: 'pending' as const,
          },
        },
      ])
    ).rejects.toThrow();
  });
});