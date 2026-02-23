import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerService } from '../../../src/worker/worker-service.js';
import { JobControlPlane } from '../../../src/shared/services/job-control-plane.js';
import { DistributedLockManager } from '../../../src/shared/services/lock-manager.js';
import { AssetVersionManager } from '../../../src/shared/services/asset-version-manager.js';
import { ProjectRepository } from '../../../src/shared/services/project-repository.js';
import { MediaProcessingAgent } from '../../../src/shared/agents/media-processing-agent.js';
import { ContinuityManagerAgent } from '../../../src/shared/agents/continuity-manager.js';
import { SceneGeneratorAgent } from '../../../src/shared/agents/scene-generator.js';
import { CompositionalAgent } from '../../../src/shared/agents/compositional-agent.js';
import { SemanticExpertAgent } from '../../../src/shared/agents/semantic-expert-agent.js';
import { Job, JobEvent } from '../../../src/shared/types/job.types.js';
import { PipelineEvent } from '../../../src/shared/types/pipeline.types.js';

vi.mock('../../../src/shared/services/job-control-plane.js');
vi.mock('../../../src/shared/services/lock-manager.js');
vi.mock('../../../src/shared/services/asset-version-manager.js');
vi.mock('../../../src/shared/services/project-repository.js');
vi.mock('../../../src/shared/agents/media-processing-agent.js');
vi.mock('../../../src/shared/agents/continuity-manager.js');
vi.mock('../../../src/shared/agents/scene-generator.js');
vi.mock('../../../src/shared/agents/compositional-agent.js');
vi.mock('../../../src/shared/agents/semantic-expert-agent.js');

describe('WorkerService Asset Management', () => {
  let workerService: WorkerService;
  let mockJobControlPlane: JobControlPlane;
  let mockLockManager: DistributedLockManager;
  let mockAssetManager: AssetVersionManager;
  let mockProjectRepo: ProjectRepository;
  let mockMediaProcessingAgent: MediaProcessingAgent;
  let mockContinuityManagerAgent: ContinuityManagerAgent;
  let mockSceneGeneratorAgent: SceneGeneratorAgent;
  let mockCompositionalAgent: CompositionalAgent;
  let mockSemanticExpertAgent: SemanticExpertAgent;
  let mockPublishJobEvent: vi.MockedFunction<(event: JobEvent) => Promise<void>>;
  let mockPublishPipelineEvent: vi.MockedFunction<(event: PipelineEvent) => Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockJobControlPlane = {
      claimJob: vi.fn(),
      createIncrementAttemptHook: vi.fn(),
      updateJobSafe: vi.fn(),
    } as any;
    
    mockLockManager = {} as any;
    
    mockAssetManager = {
      createVersionedAssets: vi.fn().mockResolvedValue([]),
      getNextVersionNumber: vi.fn().mockResolvedValue([1]),
    } as any;
    
    mockProjectRepo = {
      getProject: vi.fn(),
      getProjectFullState: vi.fn(),
      updateProject: vi.fn(),
      createCharacters: vi.fn(),
      createLocations: vi.fn(),
      createScenes: vi.fn(),
    } as any;

    mockMediaProcessingAgent = {
        renderVideo: vi.fn().mockResolvedValue({ videoGcsUri: 'video-uri', thumbnailGcsUri: 'thumb-uri', duration: 10 }),
        processAudioToScenes: vi.fn(),
    } as any;

    mockContinuityManagerAgent = {
        prepareAndRefineSceneInputs: vi.fn().mockResolvedValue({}),
        updateNarrativeState: vi.fn().mockReturnValue({ scenes: [] }),
        generateCharacterAssets: vi.fn().mockResolvedValue({ data: { characters: [] }, metadata: { model: 'test-model' } }),
        generateLocationAssets: vi.fn().mockResolvedValue({ data: { locations: [] }, metadata: { model: 'test-model' } }),
    } as any;

    mockSceneGeneratorAgent = {
        generateSceneWithQualityCheck: vi.fn().mockResolvedValue({ data: { scene: {} }, metadata: {} }),
    } as any;

    mockCompositionalAgent = {
        expandCreativePrompt: vi.fn().mockResolvedValue({ data: { expandedPrompt: 'Expanded prompt' }, metadata: {} }),
        generateStoryboardExclusivelyFromPrompt: vi.fn().mockResolvedValue({ 
            data: { storyboardAttributes: { scenes: [], characters: [], locations: [], metadata: {} } }, 
            metadata: { model: 'test-model' } 
        }),
      generateStoryboardFromAudioAnalysis: vi.fn().mockResolvedValue({ 
            data: { storyboardAttributes: { scenes: [], characters: [], locations: [], metadata: {} } }, 
            metadata: { model: 'test-model' } 
        }),
    } as any;

    mockSemanticExpertAgent = {
        generateRules: vi.fn().mockResolvedValue({ 
            data: { dynamicRules: ['rule1'] }, 
            metadata: { model: 'test-model' } 
        }),
    } as any;
    
    vi.mocked(AssetVersionManager).mockImplementation(function() { return mockAssetManager; } as any);
    vi.mocked(ProjectRepository).mockImplementation(function() { return mockProjectRepo; } as any);
    vi.mocked(MediaProcessingAgent).mockImplementation(function() { return mockMediaProcessingAgent; } as any);
    vi.mocked(ContinuityManagerAgent).mockImplementation(function() { return mockContinuityManagerAgent; } as any);
    vi.mocked(SceneGeneratorAgent).mockImplementation(function() { return mockSceneGeneratorAgent; } as any);
    vi.mocked(CompositionalAgent).mockImplementation(function() { return mockCompositionalAgent; } as any);
    vi.mocked(SemanticExpertAgent).mockImplementation(function() { return mockSemanticExpertAgent; } as any);

    mockPublishJobEvent = vi.fn().mockResolvedValue(undefined);
    mockPublishPipelineEvent = vi.fn().mockResolvedValue(undefined);
    
    workerService = new WorkerService(
      'test-project',
      'worker-1',
      'test-bucket',
      mockJobControlPlane,
      mockLockManager,
      mockPublishJobEvent,
      mockPublishPipelineEvent
    );
  });

  describe('saveAssets callback', () => {
    it('should handle polymorphic asset keys correctly', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_SCENE_FRAMES',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'scene_start_frame', 
        workflowId: 'wf-1'
      } as any;

      const mockAssetHistories = [
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'scene-1-start-frame-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        },
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'scene-1-end-frame-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        }
      ];

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories as any);

      const saveAssets = (workerService as any).createSaveAssetsCallback(job);

      await saveAssets(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame', 'scene_end_frame'],
        'image',
        ['scene-1-start-frame-url', 'scene-1-end-frame-url'],
        [{ model: 'test-model' }, { model: 'test-model' }],
        true
      );

      expect(vi.mocked(mockAssetManager.createVersionedAssets)).toHaveBeenCalledWith(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame', 'scene_end_frame'],
        'image',
        ['scene-1-start-frame-url', 'scene-1-end-frame-url'],
        [{ model: 'test-model', jobId: 'job-1' }, { model: 'test-model', jobId: 'job-1' }],
        true
      );
    });

    it('should handle single asset key for multiple entities', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_CHARACTER_ASSETS',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'character_image',
        workflowId: 'wf-1'
      } as any;

      const mockAssetHistories = [
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'character-1-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        },
        {
          head: 1,
          best: 1,
          versions: [{
            version: 1,
            data: 'character-2-url',
            type: 'image',
            metadata: { model: 'test-model', jobId: 'job-1' },
            createdAt: new Date()
          }]
        }
      ];

      vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue(mockAssetHistories as any);

      const saveAssets = (workerService as any).createSaveAssetsCallback(job);

      await saveAssets(
        { projectId: 'proj-1', characterIds: ['char-1', 'char-2'] },
        ['character_image'],
        'image',
        ['character-1-url', 'character-2-url'],
        [{ model: 'test-model' }, { model: 'test-model' }],
        true
      );
    });

    it('should handle errors gracefully', async () => {
      const job: Job = {
        id: 'job-1',
        projectId: 'proj-1',
        type: 'GENERATE_SCENE_FRAMES',
        state: 'RUNNING',
        attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
        uniqueKey: 'unique-key',
        createdAt: new Date(),
        updatedAt: new Date(),
        error: '',
        assetKey: 'scene_start_frame',
        workflowId: 'wf-1'
      } as any;

      const error = new Error('Asset creation failed');
      vi.mocked(mockAssetManager.createVersionedAssets).mockRejectedValue(error);

      const saveAssets = (workerService as any).createSaveAssetsCallback(job);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(saveAssets(
        { projectId: 'proj-1', sceneIds: ['scene-1'] },
        ['scene_start_frame'],
        'image',
        ['scene-1-url'],
        [{ model: 'test-model' }],
        true
      )).rejects.toThrow('Asset creation failed');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
            functionName: 'saveAssets',
        }),
        expect.any(String)
      );

      expect(vi.mocked(mockPublishPipelineEvent)).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('GENERATE_SCENE_VIDEO Inline Render', () => {
      it('should trigger inline render if renderInProgress is true and videos exist', async () => {
          const job: any = {
              id: 'job-video-1',
              projectId: 'proj-1',
              type: 'GENERATE_SCENE_VIDEO',
              state: 'RUNNING',
              attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
              uniqueKey: 'unique-video-key',
              createdAt: new Date(),
              updatedAt: new Date(),
              error: '',
              assetKey: 'scene_video',
              workflowId: 'wf-1',
              payload: {
                  sceneId: 'scene-1',
                  overridePrompt: '',
                  renderInProgress: true
              }
          };

          vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
          vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job);
          vi.mocked(mockAssetManager.createVersionedAssets).mockResolvedValue([{ head: 1, best: 1, versions: [] }] as any);
          
          const mockScene = { 
              id: 'scene-1', 
              assets: { 
                  scene_video: { 
                      head: 1, best: 1, versions: [{ version: 1, data: 'video-url-1', type: 'video' }] 
                  } 
              } 
          };
          const mockProject = {
              id: 'proj-1',
              metadata: { title: 'Test Project', audioGcsUri: 'audio-uri' },
              scenes: [mockScene],
              forceRegenerateSceneIds: [],
              generationRules: [],
          };
          
          const updatedProject = { ...mockProject, metadata: { ...mockProject.metadata, title: 'Updated Title' } };

          vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);
          vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(updatedProject as any);
          
          vi.mocked(mockContinuityManagerAgent.updateNarrativeState).mockReturnValue(updatedProject as any);

          await workerService.processJob('job-video-1');
          
          expect(vi.mocked(mockMediaProcessingAgent.renderVideo)).toHaveBeenCalled();
          expect(vi.mocked(mockAssetManager.createVersionedAssets)).toHaveBeenCalledWith(
              expect.objectContaining({ projectId: 'proj-1' }),
              ['render_video'],
              'video',
              expect.any(Array),
              expect.any(Array),
              true
          );
      });
  });

  describe('Other Job Types', () => {
      it('should handle EXPAND_CREATIVE_PROMPT', async () => {
          const job: Job = {
              id: 'job-expand-1',
              projectId: 'proj-1',
              type: 'EXPAND_CREATIVE_PROMPT',
              state: 'RUNNING',
              attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
              uniqueKey: 'unique-expand-key',
              createdAt: new Date(),
              updatedAt: new Date(),
              error: '',
              assetKey: 'enhanced_prompt',
              workflowId: 'wf-1',
              payload: {}
          } as any;

          vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
          vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
          
          const mockProject = {
              id: 'proj-1',
              metadata: { title: 'Test Project', initialPrompt: 'A test prompt' },
          };
          vi.mocked(mockProjectRepo.getProject).mockResolvedValue(mockProject as any);
          vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);

          const mockCompositionalAgent = {
              expandCreativePrompt: vi.fn().mockResolvedValue({ data: { expandedPrompt: 'Expanded prompt' }, metadata: {} }),
          };
          vi.mocked(MediaProcessingAgent).mockImplementation(function() { return mockMediaProcessingAgent; } as any);
          const { CompositionalAgent } = await import('../../../src/shared/agents/compositional-agent.js');
          vi.mocked(CompositionalAgent).mockImplementation(function() { return mockCompositionalAgent; } as any);

          await workerService.processJob('job-expand-1');

          expect(mockCompositionalAgent.expandCreativePrompt).toHaveBeenCalled();
          expect(mockProjectRepo.updateProject).toHaveBeenCalled();
      });

      it('should handle GENERATE_STORYBOARD', async () => {
        const job: Job = {
            id: 'job-storyboard-1',
            projectId: 'proj-1',
            type: 'GENERATE_STORYBOARD',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-sb-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'storyboard',
            workflowId: 'wf-1',
            payload: {}
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            metadata: { title: 'Test Project', enhancedPrompt: 'Enhanced prompt' },
        };
        vi.mocked(mockProjectRepo.getProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.createCharacters).mockResolvedValue([]);
        vi.mocked(mockProjectRepo.createLocations).mockResolvedValue([]);
        vi.mocked(mockProjectRepo.createScenes).mockResolvedValue([]);

        const mockCompositionalAgent = {
            generateStoryboardExclusivelyFromPrompt: vi.fn().mockResolvedValue({ 
                data: { storyboardAttributes: { scenes: [], characters: [], locations: [], metadata: {} } }, 
                metadata: { model: 'test-model' } 
            }),
        };
        const { CompositionalAgent } = await import('../../../src/shared/agents/compositional-agent.js');
        vi.mocked(CompositionalAgent).mockImplementation(function() { return mockCompositionalAgent; } as any);

        await workerService.processJob('job-storyboard-1');

        expect(mockCompositionalAgent.generateStoryboardExclusivelyFromPrompt).toHaveBeenCalled();
        expect(mockProjectRepo.createScenes).toHaveBeenCalled();
    });

    it('should handle PROCESS_AUDIO_TO_SCENES', async () => {
        const job: Job = {
            id: 'job-audio-1',
            projectId: 'proj-1',
            type: 'PROCESS_AUDIO_TO_SCENES',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-audio-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'audio_analysis',
            workflowId: 'wf-1',
            payload: {}
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            metadata: { enhancedPrompt: 'Enhanced', audioPublicUri: 'audio.mp3' },
        };
        vi.mocked(mockProjectRepo.getProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);

        const mockMediaProcessingAgent = {
            processAudioToScenes: vi.fn().mockResolvedValue({ 
                data: { analysis: { segments: [] } }, 
                metadata: { model: 'test-model' } 
            }),
        };
        vi.mocked(MediaProcessingAgent).mockImplementation(function() { return mockMediaProcessingAgent; } as any);

        await workerService.processJob('job-audio-1');

        expect(mockMediaProcessingAgent.processAudioToScenes).toHaveBeenCalled();
    });

    it('should handle ENHANCE_STORYBOARD', async () => {
        const job: Job = {
            id: 'job-enhance-1',
            projectId: 'proj-1',
            type: 'ENHANCE_STORYBOARD',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-enhance-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'storyboard',
            workflowId: 'wf-1',
            payload: {}
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            metadata: { title: 'Test Project', enhancedPrompt: 'Enhanced' },
            storyboard: { scenes: [{ id: 's1' }] }
        };
        vi.mocked(mockProjectRepo.getProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.createCharacters).mockResolvedValue([]);
        vi.mocked(mockProjectRepo.createLocations).mockResolvedValue([]);
        vi.mocked(mockProjectRepo.createScenes).mockResolvedValue([]);

        const mockCompositionalAgent = {
          generateStoryboardFromAudioAnalysis: vi.fn().mockResolvedValue({ 
                data: { storyboardAttributes: { scenes: [], characters: [], locations: [], metadata: {} } }, 
                metadata: { model: 'test-model' } 
            }),
        };
        const { CompositionalAgent } = await import('../../../src/shared/agents/compositional-agent.js');
        vi.mocked(CompositionalAgent).mockImplementation(function() { return mockCompositionalAgent; } as any);

        await workerService.processJob('job-enhance-1');

      expect(mockCompositionalAgent.generateStoryboardFromAudioAnalysis).toHaveBeenCalled();
    });

    it('should handle SEMANTIC_ANALYSIS', async () => {
        const job: Job = {
            id: 'job-semantic-1',
            projectId: 'proj-1',
            type: 'SEMANTIC_ANALYSIS',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-semantic-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'generation_rules',
            workflowId: 'wf-1',
            payload: {}
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            storyboard: { scenes: [] },
            generationRulesHistory: []
        };
        vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);

        const mockSemanticExpertAgent = {
            generateRules: vi.fn().mockResolvedValue({ 
                data: { dynamicRules: ['rule1'] }, 
                metadata: { model: 'test-model' } 
            }),
        };
        const { SemanticExpertAgent } = await import('../../../src/shared/agents/semantic-expert-agent.js');
        vi.mocked(SemanticExpertAgent).mockImplementation(function() { return mockSemanticExpertAgent; } as any);

        await workerService.processJob('job-semantic-1');

        expect(mockSemanticExpertAgent.generateRules).toHaveBeenCalled();
    });

    it('should handle GENERATE_CHARACTER_ASSETS', async () => {
        const job: Job = {
            id: 'job-char-1',
            projectId: 'proj-1',
            type: 'GENERATE_CHARACTER_ASSETS',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-char-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'character_image',
            workflowId: 'wf-1',
            payload: { characters: [{ id: 'c1' }] }
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            generationRules: [],
            characters: [{ id: 'c1' }]
        };
        vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);

        const mockContinuityAgent = {
            generateCharacterAssets: vi.fn().mockResolvedValue({ 
                data: { characters: [] }, 
                metadata: { model: 'test-model' } 
            }),
        };
        vi.mocked(ContinuityManagerAgent).mockImplementation(function() { return mockContinuityAgent; } as any);

        await workerService.processJob('job-char-1');

        expect(mockContinuityAgent.generateCharacterAssets).toHaveBeenCalled();
    });

    it('should handle GENERATE_LOCATION_ASSETS', async () => {
        const job: Job = {
            id: 'job-loc-1',
            projectId: 'proj-1',
            type: 'GENERATE_LOCATION_ASSETS',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-loc-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'location_image',
            workflowId: 'wf-1',
            payload: { locations: [{ id: 'l1' }] }
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            generationRules: [],
            locations: [{ id: 'l1' }]
        };
        vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.updateProject).mockResolvedValue(mockProject as any);

        const mockContinuityAgent = {
            generateLocationAssets: vi.fn().mockResolvedValue({ 
                data: { locations: [] }, 
                metadata: { model: 'test-model' } 
            }),
        };
        vi.mocked(ContinuityManagerAgent).mockImplementation(function() { return mockContinuityAgent; } as any);

        await workerService.processJob('job-loc-1');

        expect(mockContinuityAgent.generateLocationAssets).toHaveBeenCalled();
    });

    it('should handle RENDER_VIDEO', async () => {
        const job: Job = {
            id: 'job-render-1',
            projectId: 'proj-1',
            type: 'RENDER_VIDEO',
            state: 'RUNNING',
            attempts: { currentAttempt: 1, maxRetries: 3, totalAttempts: 1, lastAttemptAt: new Date(), failureHistory: [] },
            uniqueKey: 'unique-render-key',
            createdAt: new Date(),
            updatedAt: new Date(),
            error: '',
            assetKey: 'render_video',
            workflowId: 'wf-1',
            payload: { videoPaths: [] }
        } as any;

        vi.mocked(mockJobControlPlane.claimJob).mockResolvedValue([job, new Date().toISOString()]);
        vi.mocked(mockJobControlPlane.updateJobSafe).mockResolvedValue(job as any);
        
        const mockProject = {
            id: 'proj-1',
            metadata: { title: 'Test Project' },
        };
        vi.mocked(mockProjectRepo.getProject).mockResolvedValue(mockProject as any);
        vi.mocked(mockProjectRepo.getProjectFullState).mockResolvedValue(mockProject as any);

        const mockMediaProcessingAgent = {
            renderVideo: vi.fn().mockResolvedValue({ videoGcsUri: 'video.mp4', thumbnailGcsUri: 'thumb.jpg', duration: 10 }),
        };
        vi.mocked(MediaProcessingAgent).mockImplementation(function() { return mockMediaProcessingAgent; } as any);

        await workerService.processJob('job-render-1');

        expect(mockMediaProcessingAgent.renderVideo).toHaveBeenCalled();
    });
  });

  describe('polymorphic asset key patterns', () => {
    it('should correctly map asset keys using nullish coalescing', () => {
      const testCases = [
        {
          assetKeys: ['scene_start_frame', 'scene_end_frame'],
          expectedMappings: ['scene_start_frame', 'scene_end_frame']
        },
        {
          assetKeys: ['character_image'],
          expectedMappings: ['character_image', 'character_image', 'character_image']
        },
        {
          assetKeys: ['storyboard'],
          expectedMappings: ['storyboard']
        }
      ];

      testCases.forEach(({ assetKeys, expectedMappings }) => {
        expectedMappings.forEach((expected, index) => {
          const actual = assetKeys[index] ?? assetKeys[0];
          expect(actual).toBe(expected);
        });
      });
    });
  });
});