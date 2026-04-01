import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyAdminToken, extractToken } from "./auth";

declare global {
  namespace Express {
    interface Request {
      platformAdmin?: typeof usersTable.$inferSelect;
    }
  }
}

export async function platformAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req as any);
    if (!token) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const payload = verifyAdminToken(token);

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.userId) });
    if (!user || !user.isPlatformAdmin) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    req.platformAdmin = user;
    next();
  } catch {
    res.status(403).json({ error: "Forbidden." });
  }
}
