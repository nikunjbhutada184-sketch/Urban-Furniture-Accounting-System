"use server";

import { requireUser } from "@/modules/auth/session";
import { prisma } from "@/server/db/prisma";
import { runAction } from "@/modules/shared/run-action";
import { adjustStock, getCurrentStock } from "./stock-service";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const adjustStockSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().refine((val) => val !== 0, "Quantity cannot be zero"),
  unitCost: z.number().min(0, "Unit cost must be positive"),
  reference: z.string().optional(),
});

export const adjustStockAction = runAction(
  adjustStockSchema,
  async (data, context) => {
    const user = await requireUser();
    
    const move = await adjustStock(prisma, {
      ...data,
      userId: user.id,
    });
    
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${data.productId}`);
    return move;
  }
);
