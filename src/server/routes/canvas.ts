import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  upsertBatchCanvasLayouts,
  fetchCanvasLayouts,
  deleteCanvasLayout
} from "../../shared/services/canvasLayoutService.js";
import { usersAndTeamsDbService } from "../../shared/services/usersAndTeamsDbService.js";
import { worlds, worldAccessGrants } from "../../shared/db/schema.js";
import { eq, and } from "drizzle-orm";
import { getSacGitService } from "../../shared/services/sac/SacGitServiceStub.js";

export const canvasRouter = Router();
const sacService = getSacGitService();

// ============================================================================
// CANVAS LAYOUT ENDPOINTS
// ============================================================================

canvasRouter.get("/api/canvas/:contextType/:contextId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contextId } = req.params;
    const layouts = await fetchCanvasLayouts(contextId);
    res.status(200).json(layouts);
  } catch (error) {
    console.error("[canvasRouter] fetch error", error);
    res.status(500).json({ error: "Failed to fetch canvas layouts" });
  }
});

canvasRouter.put("/api/canvas/:contextType/:contextId/batch", requireAuth, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    await upsertBatchCanvasLayouts(payload);
    res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.message.includes("OCC conflict")) {
      res.status(409).json({ error: error.message });
    } else {
      console.error("[canvasRouter] batch upsert error", error);
      res.status(500).json({ error: "Failed to persist layouts" });
    }
  }
});

canvasRouter.delete("/api/canvas/:contextType/:contextId/:entityId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contextId, entityId } = req.params;
    await deleteCanvasLayout(contextId, entityId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[canvasRouter] delete error", error);
    res.status(500).json({ error: "Failed to delete canvas layout" });
  }
});

// ============================================================================
// WORLD ACCESS GRANTS
// ============================================================================

canvasRouter.get("/api/worlds/:worldId/access", requireAuth, async (req: Request, res: Response) => {
  try {
    const { worldId } = req.params;
    const userId = (req as any).user?.id; // from requireAuth middleware

    // Check for explicit grant
    const grant = await usersAndTeamsDbService.getWorldAccessGrant(worldId, userId);

    if (!grant) {
      // For POC: Default to owner if no explicit grant is found yet.
      // In full production, this would check `usersToWorlds` or `usersToTeams` 
      // to establish implied ownership.
      return res.status(200).json({ role: 'owner', licenseType: 'base_ledger' });
    }

    res.status(200).json({ role: grant.role, licenseType: grant.licenseType });
  } catch (error) {
    console.error("[canvasRouter] access fetch error", error);
    res.status(500).json({ error: "Failed to fetch world access" });
  }
});

// ============================================================================
// SCENE AS CODE (SAC) LEDGER ENDPOINTS
// ============================================================================

canvasRouter.post("/api/sac/worlds/:worldId/repo", requireAuth, async (req: Request, res: Response) => {
  try {
    const { worldId } = req.params;
    const result = await sacService.createRepo(worldId);
    await usersAndTeamsDbService.updateWorldSacRepo(worldId, result.repoId, result.repoUrl);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to create SAC repo" });
  }
});

canvasRouter.post("/api/sac/projects/:projectId/fork", requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { worldId } = req.body;
    if (!worldId) return res.status(400).json({ error: "worldId is required to fork" });
    const result = await sacService.forkRepo(worldId, projectId);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fork SAC repo" });
  }
});

canvasRouter.post("/api/sac/repos/:repoId/commit", requireAuth, async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const { ledger, message } = req.body;
    const result = await sacService.commitLedger(repoId, ledger, message);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to commit ledger" });
  }
});

canvasRouter.get("/api/sac/repos/:repoId/commits", requireAuth, async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const history = await sacService.listCommits(repoId);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch commit history" });
  }
});

export default canvasRouter;
