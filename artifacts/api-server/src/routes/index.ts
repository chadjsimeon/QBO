import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import customersRouter from "./customers";
import vendorsRouter from "./vendors";
import accountsRouter from "./accounts";
import invoicesRouter from "./invoices";
import billsRouter from "./bills";
import paymentsRouter from "./payments";
import bankingRouter from "./banking";
import reportsRouter from "./reports";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(customersRouter);
router.use(vendorsRouter);
router.use(accountsRouter);
router.use(invoicesRouter);
router.use(billsRouter);
router.use(paymentsRouter);
router.use(bankingRouter);
router.use(reportsRouter);
router.use(dashboardRouter);

export default router;
