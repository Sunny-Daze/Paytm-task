import express from "express";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import appRouter from "./appRoutes.routes.js";
import { requestLogger } from "./middlewares/requestLogger.middleware.js";

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use("/api/v1", appRouter);
app.use(errorHandler);

export default app;
