import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import contacts from "./contacts";
import organizations from "./organizations";
import businessCards from "./businessCards";
import tasks from "./tasks";
import activities from "./activities";
import opportunities from "./opportunities";
import pipelines from "./pipelines";
import notes from "./notes";
import tags from "./tags";
import reports from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use("/contacts", contacts);
router.use("/organizations", organizations);
router.use("/business-cards", businessCards);
router.use("/tasks", tasks);
router.use("/activities", activities);
router.use("/opportunities", opportunities);
router.use("/pipelines", pipelines);
router.use("/notes", notes);
router.use("/tags", tags);
router.use("/reports", reports);

export default router;
