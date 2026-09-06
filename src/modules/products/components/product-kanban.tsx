import {
  KanbanCard,
  KanbanField,
  KanbanGrid,
  KanbanThumbnail,
  initialsOf,
} from "@/components/data-table/kanban";
import { Badge } from "@/components/ui/badge";
import { type ProductListRow } from "@/modules/products/product-service";
import { PRODUCT_TYPE_LABELS } from "@/modules/products/schemas";

/**
 * Product kanban view: image, name, sales price and cost per card, opening the
 * form view on click.
 */
export function ProductKanban({ rows }: { rows: ProductListRow[] }) {
  return (
    <KanbanGrid>
      {rows.map((product) => (
        <KanbanCard
          key={product.id}
          href={`/products/${product.id}/edit`}
          muted={product.isArchived}
        >
          <div className="flex items-start gap-3">
            <KanbanThumbnail
              src={product.imageUrl}
              alt={`${product.name} photo`}
              fallback={initialsOf(product.name)}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{product.name}</span>
                {product.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
              </div>

              {product.sku ? (
                <p className="text-muted-foreground truncate text-xs">{product.sku}</p>
              ) : null}

              <div className="mt-2 space-y-0.5">
                <KanbanField label="Sales Price" value={product.salesPrice} tabular />
                <KanbanField label="Cost" value={product.cost} tabular />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <Badge variant="secondary">{PRODUCT_TYPE_LABELS[product.type]}</Badge>
                {product.categoryName ? (
                  <Badge variant="outline">{product.categoryName}</Badge>
                ) : null}
                {product.trackInventory ? <Badge variant="outline">Stock</Badge> : null}
              </div>
            </div>
          </div>
        </KanbanCard>
      ))}
    </KanbanGrid>
  );
}
