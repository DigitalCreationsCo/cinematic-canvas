import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

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
