import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import contacts from "./contacts";
import organizations from "./organizations";
import businessCards from "./businessCards";
import organizationScans from "./organizationScans";
import tasks from "./tasks";
import activities from "./activities";
import opportunities from "./opportunities";
import pipelines from "./pipelines";
import notes from "./notes";
import tags from "./tags";
import reports from "./reports";
import auth from "./auth";
import adminAuth from "./adminAuth";
import adminWorkspaces from "./adminWorkspaces";
import emsProfiles from "./emsProfiles";
import adminPipelineTemplates from "./adminPipelineTemplates";
import workspacePipelineViews from "./workspacePipelineViews";
import workspaceMembers from "./workspaceMembers";
import structureScans from "./structureScans";
import adminMasterOrganizations from "./adminMasterOrganizations";
import adminMasterOrganizationRelationships from "./adminMasterOrganizationRelationships";
import adminStats from "./adminStats";
import adminMasterOrgScans from "./adminMasterOrgScans";
import { authMiddleware } from "../lib/authMiddleware";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", auth);
router.use("/admin", adminAuth);
router.use("/admin/workspaces", adminWorkspaces);
router.use("/admin/master-organizations", platformAdminMiddleware, adminMasterOrganizations);
router.use("/admin/master-organization-relationships", platformAdminMiddleware, adminMasterOrganizationRelationships);
router.use("/admin/stats", adminStats);
router.use("/admin/pipeline-templates", platformAdminMiddleware, adminPipelineTemplates);
router.use("/admin/master-org-scans", platformAdminMiddleware, adminMasterOrgScans);
router.use(storageRouter);

router.use(authMiddleware);

router.use("/contacts", contacts);
router.use("/organizations", organizations);
router.use("/business-cards", businessCards);
router.use("/organization-scans", organizationScans);
router.use("/tasks", tasks);
router.use("/activities", activities);
router.use("/opportunities", opportunities);
router.use("/pipelines", pipelines);
router.use("/notes", notes);
router.use("/tags", tags);
router.use("/reports", reports);
router.use(emsProfiles);
router.use("/workspaces", workspaceMembers);

router.use("/structure-scans", structureScans);

router.use("/workspaces/:workspaceId/pipeline-views", workspacePipelineViews);

export default router;
