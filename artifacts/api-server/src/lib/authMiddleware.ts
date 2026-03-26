import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, workspacesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken, extractToken } from "./auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: typeof usersTable.$inferSelect;
      authWorkspace?: typeof workspacesTable.$inferSelect;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req as any);
    if (!token) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    const payload = verifyToken(token);
    const [user, workspace] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.userId) }),
      db.query.workspacesTable.findFirst({ where: eq(workspacesTable.id, payload.workspaceId) }),
    ]);
    if (!user || !workspace) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }
    req.authUser = user;
    req.authWorkspace = workspace;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session." });
  }
}
