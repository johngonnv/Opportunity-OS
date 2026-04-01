import { Router } from "express";
import { db } from "@workspace/db";
import {
  opportunityEmsInterfacilityProfilesTable,
  organizationEmsProfilesTable,
  opportunitiesTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const opp = await db.select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (opp.length === 0) return res.status(404).json({ error: "Opportunity not found" });

    const [profile] = await db.select()
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    res.json(profile ?? null);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const opp = await db.select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (opp.length === 0) return res.status(404).json({ error: "Opportunity not found" });

    const existing = await db.select({ id: opportunityEmsInterfacilityProfilesTable.id })
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(opportunityEmsInterfacilityProfilesTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(opportunityEmsInterfacilityProfilesTable.id, existing[0].id))
        .returning();
      return res.json(updated);
    }

    const [profile] = await db.insert(opportunityEmsInterfacilityProfilesTable)
      .values({ ...req.body, opportunityId: req.params.id })
      .returning();
    res.status(201).json(profile);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const opp = await db.select({ id: opportunitiesTable.id })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (opp.length === 0) return res.status(404).json({ error: "Opportunity not found" });

    const existing = await db.select({ id: opportunityEmsInterfacilityProfilesTable.id })
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    if (existing.length === 0) {
      const [profile] = await db.insert(opportunityEmsInterfacilityProfilesTable)
        .values({ ...req.body, opportunityId: req.params.id })
        .returning();
      return res.status(201).json(profile);
    }

    const [updated] = await db.update(opportunityEmsInterfacilityProfilesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(opportunityEmsInterfacilityProfilesTable.id, existing[0].id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/organizations/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)))
      .limit(1);
    if (org.length === 0) return res.status(404).json({ error: "Organization not found" });

    const [profile] = await db.select()
      .from(organizationEmsProfilesTable)
      .where(eq(organizationEmsProfilesTable.organizationId, req.params.id))
      .limit(1);

    res.json(profile ?? null);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/organizations/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)))
      .limit(1);
    if (org.length === 0) return res.status(404).json({ error: "Organization not found" });

    const existing = await db.select({ id: organizationEmsProfilesTable.id })
      .from(organizationEmsProfilesTable)
      .where(eq(organizationEmsProfilesTable.organizationId, req.params.id))
      .limit(1);

    if (existing.length === 0) {
      const [profile] = await db.insert(organizationEmsProfilesTable)
        .values({ ...req.body, organizationId: req.params.id })
        .returning();
      return res.status(201).json(profile);
    }

    const [updated] = await db.update(organizationEmsProfilesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(organizationEmsProfilesTable.id, existing[0].id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
