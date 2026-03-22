import { Router, Request, Response } from "express";
import { PubSub } from "@google-cloud/pubsub";
import { requireAuth } from "../middleware/auth.js";
import {
  upsertBatchCanvasLayouts,
  fetchCanvasLayouts,
  deleteCanvasLayout,
  confirmCanvasChanges
} from "../../shared/services/canvasLayoutService.js";
import { usersAndTeamsDbService } from "../../shared/services/usersAndTeamsDbService.js";
import { getSacGitService } from "../../shared/services/sac/SacGitServiceStub.js";
import { ProjectRepository } from "../../shared/services/project-repository.js";
import { AssetVersionManager } from "../../shared/services/asset-version-manager.js";
import { CanvasNodeType, PendingChange } from "../../shared/types/canvas.types.js";
import { BatchEntityUpdateRequest } from "../../shared/types/editable.types.js";
import { PipelineEvent } from "../../shared/types/pipeline.types.js";
import { PIPELINE_EVENTS_TOPIC_NAME } from "../../shared/config.js";
import { api } from "./api-routes.js";

const router = Router();
const sacService = getSacGitService();
const projectRepository = new ProjectRepository();
const assetVersionManager = new AssetVersionManager(projectRepository);

// Initialize PubSub for event publishing
const pubsub = new PubSub({
  ...(process.env.PUBSUB_EMULATOR_HOST && {
    apiEndpoint: process.env.PUBSUB_EMULATOR_HOST,
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  }),
});

const eventsTopic = pubsub.topic(PIPELINE_EVENTS_TOPIC_NAME);

async function publishCanvasEvent(event: {
  type: string;
  projectId: string;
  payload: any;
}) {
  const fullEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  const data = Buffer.from(JSON.stringify(fullEvent));
  try {
    await eventsTopic.publishMessage({
      data,
      attributes: { projectId: event.projectId, type: event.type }
    });
  } catch (error) {
    console.error('[canvas.routes] Failed to publish canvas event:', error);
  }
}

// ============================================================================
// CANVAS LAYOUT ENDPOINTS
// ============================================================================

router.get(api.canvas.get(":contextType", ":contextId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { contextId } = req.params;
    console.log(`[canvasRouter][fetchCanvasLayouts] Fetching layouts for contextId: ${contextId}`);

    const layouts = await fetchCanvasLayouts(contextId);
    res.status(200).json(layouts);
  } catch (error) {
    console.error(`[canvasRouter][fetchCanvasLayouts] Fetch error:`, error);
    res.status(500).json({ error: "Failed to fetch canvas layouts" });
  }
});

router.put(api.canvas.batch(":contextType", ":contextId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { contextType, contextId } = req.params;
    const payloadUpsertCanvas = req.body;
    
    if (!Array.isArray(payloadUpsertCanvas)) {
      return res.status(400).json({ error: "Payload must be an array" });
    }
    
    console.log(`[canvasRouter][upsertBatch] Processing batch upsert.`, {
      contextType,
      contextId,
      payloadLength: payloadUpsertCanvas.length,
    });

    const newVersions = await upsertBatchCanvasLayouts(payloadUpsertCanvas);
    console.log(`[canvasRouter][upsertBatch] Success. newVersions:`, newVersions);
    
    // Build layout nodes data for SSE broadcast
    const nodes = payloadUpsertCanvas.map((node: any) => ({
      idEntity: node.idEntityTarget,
      nodeType: node.nodeTypeTarget,
      valPosX: node.valPosXTarget,
      valPosY: node.valPosYTarget,
      valWidth: node.valWidthTarget,
      valHeight: node.valHeightTarget,
      jsonUiMetadata: node.jsonUiMetadata,
      idxVersion: newVersions[node.idEntityTarget] || node.idxVersionCurrent,
    }));
    
    // Publish layout updated event for multi-user sync
    await publishCanvasEvent({
      type: "LAYOUT_UPDATED",
      projectId: contextId,
      payload: { contextType, contextId, nodes },
    });
    
    res.status(200).json({ success: true, newVersions });
  } catch (error: any) {
    if (error.message.includes("OCC conflict")) {
      console.warn(`[canvasRouter][upsertBatch] OCC Conflict detected.`);
      res.status(409).json({ error: error.message });
    } else {
      console.error(`[canvasRouter][upsertBatch] Batch upsert error:`, error);
      res.status(500).json({ error: "Failed to persist layouts" });
    }
  }
});

router.delete(api.canvas.delete(":contextType", ":contextId", ":entityId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { contextId, entityId } = req.params;
    console.log(`[canvasRouter][deleteLayout] Deleting layout for entityId: ${entityId}`);

    await deleteCanvasLayout(contextId, entityId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[canvasRouter][deleteLayout] Delete error:`, error);
    res.status(500).json({ error: "Failed to delete canvas layout" });
  }
});

// ============================================================================
// LIVE PATH & ATOMIC BATCH ENDPOINT
// ============================================================================

router.post(api.canvas.confirmChanges(), requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, updates, pendingChanges } = req.body as {
      projectId: string;
      updates: BatchEntityUpdateRequest['updates'];
      pendingChanges: PendingChange[];
    };

    if (!projectId || !updates || !pendingChanges) {
      console.warn(`[canvasRouter][confirmChanges] Missing required payload parameters.`);
      return res.status(400).json({ error: "projectId, updates, and pendingChanges are required." });
    }

    console.log(`[canvasRouter][confirmChanges] Initiating atomic batch confirmation for project: ${projectId}. Updates count: ${updates.length}, Pending edges count: ${pendingChanges.length}`);

    // Delegate the transactional processing to the layout service
    const affectedVersions = await confirmCanvasChanges(projectId, updates, pendingChanges);

    console.log(`[canvasRouter][confirmChanges] Successfully committed batch changes.`);
    
    // Collect affected entity IDs for layout event
    const affectedEntityIds = [
      ...new Set([
        ...pendingChanges.map((c: any) => c.sourceId),
        ...pendingChanges.map((c: any) => c.targetId),
      ])
    ];
    
    // Publish layout updated event for multi-user sync (only versions updated)
    if (affectedEntityIds.length > 0) {
      await publishCanvasEvent({
        type: "LAYOUT_UPDATED",
        projectId,
        payload: {
          contextType: 'project',
          contextId: projectId,
          nodes: affectedEntityIds.map((id: string) => ({
            idEntity: id,
            idxVersion: affectedVersions[id] || 0,
          })),
        },
      });
    }
    
    res.status(200).json({ success: true, newVersions: affectedVersions });
  } catch (error: any) {
    console.error(`[canvasRouter][confirmChanges] Transaction failed:`, error);
    res.status(500).json({ error: error.message || "Failed to commit batch changes atomically." });
  }
});

// ============================================================================
// WORLD ACCESS GRANTS
// ============================================================================

router.get(api.worlds.access(":worldId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { worldId } = req.params;
    const userId = (req as any).user?.id;

    console.log(`[canvasRouter][worldAccess] Checking access for worldId: ${worldId}, userId: ${userId}`);
    const grant = await usersAndTeamsDbService.getWorldAccessGrant(worldId, userId);

    if (!grant) {
      console.log(`[canvasRouter][worldAccess] No explicit grant found. Defaulting to base_ledger/owner for POC.`);
      return res.status(200).json({ role: 'owner', licenseType: 'base_ledger' });
    }

    res.status(200).json({ role: grant.role, licenseType: grant.licenseType });
  } catch (error) {
    console.error(`[canvasRouter][worldAccess] Access fetch error:`, error);
    res.status(500).json({ error: "Failed to fetch world access" });
  }
});

// ============================================================================
// SCENE AS CODE (SAC) LEDGER ENDPOINTS
// ============================================================================

router.post(api.sac.worldRepo(":worldId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { worldId } = req.params;
    const resultSacRepo = await sacService.createRepo(worldId);
    await usersAndTeamsDbService.updateWorldSacRepo(worldId, resultSacRepo.repoId, resultSacRepo.repoUrl);
    res.status(201).json(resultSacRepo);
  } catch (error) {
    console.error("[canvasRouter][sacCreateRepo] Failed to create SAC repo:", error);
    res.status(500).json({ error: "Failed to create SAC repo" });
  }
});

router.post(api.sac.projectFork(":projectId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { worldId } = req.body;
    if (!worldId) return res.status(400).json({ error: "worldId is required to fork" });

    const resultSacFork = await sacService.forkRepo(worldId, projectId);
    res.status(201).json(resultSacFork);
  } catch (error) {
    console.error("[canvasRouter][sacForkRepo] Failed to fork SAC repo:", error);
    res.status(500).json({ error: "Failed to fork SAC repo" });
  }
});

router.post(api.sac.repoCommit(":repoId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const { ledger, message } = req.body;
    const resultSacCommit = await sacService.commitLedger(repoId, ledger, message);
    res.status(201).json(resultSacCommit);
  } catch (error) {
    console.error("[canvasRouter][sacCommit] Failed to commit ledger:", error);
    res.status(500).json({ error: "Failed to commit ledger" });
  }
});

router.get(api.sac.repoCommits(":repoId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const historySacCommits = await sacService.listCommits(repoId);
    res.status(200).json(historySacCommits);
  } catch (error) {
    console.error("[canvasRouter][sacListCommits] Failed to fetch commit history:", error);
    res.status(500).json({ error: "Failed to fetch commit history" });
  }
});

// ============================================================================
// SCENE FRAME INPUT ENDPOINT (LEGACY / ISOLATED)
// ============================================================================

router.post(api.entities.sceneFrameInput(":sceneId"), requireAuth, async (req: Request, res: Response) => {
  try {
    const { sceneId } = req.params;
    const { sourceEntityId, sourceType, projectId } = req.body as {
      sourceEntityId: string;
      sourceType: CanvasNodeType;
      projectId: string;
    };

    if (!sourceEntityId || !sourceType) {
      return res.status(400).json({ error: "sourceEntityId and sourceType are required" });
    }

    console.log(`[frame-input] Processing link: ${sourceType}(${sourceEntityId}) -> scene(${sceneId})`);

    // 1. Resolve the actual data from the source entity
    let sourceDataUri: string | undefined;

    if (sourceType === 'scene') {
      sourceDataUri = (await assetVersionManager.getBestVersion({ projectId, sceneIds: [sourceEntityId] }, ["scene_start_frame"]))?.[0]?.data;
    } else if (sourceType === 'image') {
      // Logic: If it's a raw image node, get its primary data URI
      // Note: Implementation depends on how 'image' nodes are stored in your repo
      sourceDataUri = (await assetVersionManager.getBestVersion({ projectId, imageIds: [sourceEntityId] }, ["image_file"]))?.[0]?.data;
    }

    if (!sourceDataUri) {
      return res.status(422).json({
        error: `Source ${sourceType} does not have a valid output frame to link.`
      });
    }

    // We create a 'scene_start_frame' version for the target scene
    const [history] = await assetVersionManager.createVersionedAssets(
      { projectId, sceneIds: [sceneId] },
      ['scene_start_frame'],
      "image",
      [sourceDataUri],
      []
    );

    const result = {
      sceneId,
      sourceType,
      sourceEntityId,
      data: sourceDataUri,
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({ result, history });
  } catch (error) {
    console.error("[frame-input] Error linking frame:", {
      error: error instanceof Error ? error.message : error,
      sceneId: req.params.sceneId
    });
    res.status(500).json({ error: "Failed to link frame to scene" });
  }
});


export default router;
