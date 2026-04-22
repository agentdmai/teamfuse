import express, { Request, Response, NextFunction } from "express";
import productsRouter from "./routes/products";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use("/products", productsRouter);

  app.use((_req: Request, res: Response, _next: NextFunction) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
