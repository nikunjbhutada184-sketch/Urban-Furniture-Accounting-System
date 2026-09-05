-- Products can carry a photo, shown on the kanban cards and the product form.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
