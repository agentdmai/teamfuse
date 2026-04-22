import { Router, Request, Response } from "express";

const router = Router();

interface Product {
  id: number;
  name: string;
  price_cents: number;
  description: string;
  stock_qty: number;
}

const STUB_PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Classic T-Shirt",
    price_cents: 2999,
    description: "A comfortable everyday t-shirt.",
    stock_qty: 100,
  },
  {
    id: 2,
    name: "Canvas Tote Bag",
    price_cents: 1499,
    description: "Durable canvas bag for daily use.",
    stock_qty: 50,
  },
];

router.get("/", (_req: Request, res: Response) => {
  res.json(STUB_PRODUCTS);
});

router.get("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const product = STUB_PRODUCTS.find((p) => p.id === id);
  if (!product) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(product);
});

export default router;
