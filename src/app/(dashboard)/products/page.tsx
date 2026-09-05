import { Pencil } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { ArchiveDialog } from "@/components/data-table/archive-dialog";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import { archiveProductAction } from "@/modules/products/actions";
import { listProductCategories, listProducts } from "@/modules/products/product-service";
import {
  PRODUCT_SORT_FIELDS,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_OPTIONS,
} from "@/modules/products/schemas";
import { ARCHIVE_FILTER_OPTIONS, ARCHIVE_STATUS_VALUES } from "@/modules/shared/list-filters";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Products" };

const PATHNAME = "/products";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("master:view");
  const resolved = await searchParams;
  const categories = await listProductCategories();

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: PRODUCT_SORT_FIELDS,
    defaultSort: "name",
    allowedFilters: {
      type: PRODUCT_TYPE_OPTIONS.map((option) => option.value),
      category: categories.map((category) => category.id),
      status: ARCHIVE_STATUS_VALUES,
    },
  });

  const { rows, total } = await listProducts(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "master:create");
  const canUpdate = can(actor, "master:update");
  const canArchive = can(actor, "master:archive");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Products"
        description="Goods and services sold and purchased by Urban Furniture."
        action={canCreate ? { label: "New product", href: "/products/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by name or SKU..."
        filters={[
          {
            name: "type",
            label: "Type",
            options: PRODUCT_TYPE_OPTIONS.map((option) => ({ ...option })),
          },
          {
            name: "category",
            label: "Category",
            options: categories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          },
          { name: "status", label: "Status", options: ARCHIVE_FILTER_OPTIONS },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No products match your filters"
              description="Try a different search term, or clear the filters to see every product."
            />
          ) : (
            <EmptyState
              title="No products yet"
              description="Add the furniture and services you trade in, such as Office Chair or Dining Table."
              action={canCreate ? { label: "New product", href: "/products/new" } : undefined}
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    field="name"
                    label="Product"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="type"
                    label="Type"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Category</TableHead>
                  <SortableHeader
                    field="salesPrice"
                    label="Sales price"
                    align="right"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="cost"
                    label="Purchase price"
                    align="right"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((product) => (
                  <TableRow key={product.id} className={product.isArchived ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{product.name}</span>
                        {product.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
                        {product.trackInventory ? <Badge variant="outline">Stock</Badge> : null}
                      </div>
                      {product.sku ? (
                        <span className="text-muted-foreground text-xs">{product.sku}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{PRODUCT_TYPE_LABELS[product.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{product.salesPrice}</TableCell>
                    <TableCell className="tabular text-right">{product.cost}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/products/${product.id}/edit`}>
                              <Pencil aria-hidden />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {canArchive ? (
                          <ArchiveDialog
                            action={archiveProductAction.bind(
                              null,
                              product.id,
                              !product.isArchived,
                            )}
                            recordName={product.name}
                            entityLabel="Product"
                            isArchived={product.isArchived}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ListPagination
              meta={meta}
              pathname={PATHNAME}
              searchParams={resolved}
              itemLabel="products"
            />
          </>
        )}
      </div>
    </div>
  );
}
