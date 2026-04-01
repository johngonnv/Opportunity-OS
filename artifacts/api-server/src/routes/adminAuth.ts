import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signAdminToken, comparePassword, extractToken, verifyAdminToken } from "../lib/auth";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email.toLowerCase().trim()) });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!user.isPlatformAdmin) {
      return res.status(403).json({ error: "Access denied. Not a platform admin." });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signAdminToken({
      userId: user.id,
      email: user.email,
      isPlatformAdmin: true,
      platformRole: user.platformRole,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accountType: user.accountType,
        isPlatformAdmin: user.isPlatformAdmin,
        platformRole: user.platformRole,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/me", platformAdminMiddleware, async (req, res) => {
  try {
    const admin = req.platformAdmin!;
    res.json({
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        accountType: admin.accountType,
        isPlatformAdmin: admin.isPlatformAdmin,
        platformRole: admin.platformRole,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
