"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { createProduct, setProductArchived, updateProduct } from "./product-service";
import { productInputSchema } from "./schemas";

export async function createProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:create",
    schema: productInputSchema,
    formData,
    handler: (tx, input, actor) => createProduct(tx, input, { userId: actor.id }),
    successMessage: "Product created.",
    revalidate: ["/products"],
  });
}

export async function updateProductAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:update",
    schema: productInputSchema,
    formData,
    handler: (tx, input, actor) => updateProduct(tx, id, input, { userId: actor.id }),
    successMessage: "Product updated.",
    revalidate: ["/products", `/products/${id}`],
  });
}

export async function archiveProductAction(id: string, isArchived: boolean): Promise<ActionState> {
  return runAction({
    permission: "master:archive",
    handler: (tx, actor) => setProductArchived(tx, id, isArchived, { userId: actor.id }),
    successMessage: isArchived ? "Product archived." : "Product restored.",
    revalidate: ["/products", `/products/${id}`],
  });
}
