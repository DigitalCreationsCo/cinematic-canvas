import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { usersAndTeamsDbService } from "../../shared/services/usersAndTeamsDbService.js";

// Extend express Request to include the user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.error("Auth error:", error);
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error("Auth verification failed:", error);
    return res.status(500).json({ error: "Internal Server Error during auth" });
  }
};



interface RecordCacheMembership {
  isMemberDbResult: boolean;
  expiresAtMs: number;
}

// Memory-managed native cache. For multi-instance distributed deployments, replace Map with Redis.
const mapCacheMemberships = new Map<string, RecordCacheMembership>();

// Configuration
const TTL_CACHE_MEMBERSHIP_MS = 5 * 60 * 1000; // 5 minutes balances performance with revocation latency
const LIMIT_MAX_CACHE_ENTRIES = 10000; // Prevents OOM attacks via infinite unique header generation

export const requireTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const idUser = req.user?.id;
    const headerTeamId = req.headers["x-team-id"];

    // Defensive check: Ensure pipeline ordering
    if (!idUser) {
      console.error("[requireTeam] Missing idUser. Pipeline error: requireAuth must execute before requireTeam.");
      return res.status(401).json({ error: "Unauthorized: Missing user context" });
    }

    if (!headerTeamId || typeof headerTeamId !== "string") {
      console.warn(`[requireTeam] Missing or malformed x-team-id header for idUser: ${idUser}`);
      return res.status(400).json({ error: "Bad Request: Missing team context" });
    }

    const keyCacheMembership = `${idUser}::${headerTeamId}`;
    const recordCacheCurrent = mapCacheMemberships.get(keyCacheMembership);
    const timeNowMs = Date.now();

    // 1. Evaluate Cache
    if (recordCacheCurrent && recordCacheCurrent.expiresAtMs > timeNowMs) {
      console.debug(`[requireTeam] TRACE - Cache hit for key: ${keyCacheMembership}. isMember: ${recordCacheCurrent.isMemberDbResult}`);

      if (!recordCacheCurrent.isMemberDbResult) {
        return res.status(403).json({ error: "Forbidden: Access denied to team resources" });
      }
      return next();
    }

    // 2. Cache Miss - Query Source of Truth
    console.debug(`[requireTeam] TRACE - Cache miss/expired for key: ${keyCacheMembership}. Executing DB query.`);
    const isMemberDbResult = await usersAndTeamsDbService.isUserMemberOfTeam(idUser, headerTeamId);

    // 3. Prevent Memory Leaks (OOM mitigation for native Map)
    if (mapCacheMemberships.size >= LIMIT_MAX_CACHE_ENTRIES) {
      console.warn(`[requireTeam] Cache limit reached (${LIMIT_MAX_CACHE_ENTRIES}). Purging oldest 10%.`);
      const iteratorKeys = mapCacheMemberships.keys();
      for (let i = 0; i < LIMIT_MAX_CACHE_ENTRIES * 0.1; i++) {
        mapCacheMemberships.delete(iteratorKeys.next().value!);
      }
    }

    // 4. Update Cache
    mapCacheMemberships.set(keyCacheMembership, {
      isMemberDbResult,
      expiresAtMs: timeNowMs + TTL_CACHE_MEMBERSHIP_MS,
    });

    // 5. Authorize Request
    if (!isMemberDbResult) {
      console.warn(`[requireTeam] Access denied. idUser: ${idUser} is not a member of headerTeamId: ${headerTeamId}`);
      return res.status(403).json({ error: "Forbidden: Access denied to team resources" });
    }

    next();
  } catch (errorExecution) {
    console.error(`[requireTeam] Uncaught error verifying team membership for idUser: ${req.user?.id}`, errorExecution);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};