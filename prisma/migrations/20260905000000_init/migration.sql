-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'CONTACT');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('CUSTOMER', 'VENDOR', 'BOTH');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('GOODS', 'SERVICE', 'COMBO');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'CAPITAL', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'CURRENT_ASSET', 'FIXED_ASSET', 'INVENTORY', 'CURRENT_LIABILITY', 'TAX_RECEIVABLE', 'TAX_PAYABLE', 'CAPITAL', 'RETAINED_EARNINGS', 'INCOME', 'OTHER_INCOME', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('SALES', 'PURCHASE', 'BANK', 'CASH', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'BILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "AnalyticAccountType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaxComputation" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "TaxScope" AS ENUM ('SALE', 'PURCHASE', 'BOTH');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('PURCHASE_RECEIPT', 'SALE_DELIVERY', 'RETURN_IN', 'RETURN_OUT', 'ADJUSTMENT', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "StockMoveDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ACCOUNTANT',
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "currencySymbol" TEXT NOT NULL DEFAULT 'Rs.',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "lockDate" DATE,
    "defaultReceivableAccountId" TEXT,
    "defaultPayableAccountId" TEXT,
    "defaultIncomeAccountId" TEXT,
    "defaultExpenseAccountId" TEXT,
    "defaultTaxPayableAccountId" TEXT,
    "defaultTaxInputAccountId" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "taxNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContactType" NOT NULL DEFAULT 'CUSTOMER',
    "email" TEXT,
    "mobile" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "profileImage" TEXT,
    "receivableAccountId" TEXT,
    "payableAccountId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'GOODS',
    "salesPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "incomeAccountId" TEXT,
    "expenseAccountId" TEXT,
    "stockAccountId" TEXT,
    "cogsAccountId" TEXT,
    "salesTaxId" TEXT,
    "purchaseTaxId" TEXT,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "computation" "TaxComputation" NOT NULL DEFAULT 'PERCENTAGE',
    "rate" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "scope" "TaxScope" NOT NULL DEFAULT 'BOTH',
    "collectedAccountId" TEXT,
    "paidAccountId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'OTHER',
    "parentId" TEXT,
    "isReconcilable" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JournalType" NOT NULL,
    "defaultDebitAccountId" TEXT,
    "defaultCreditAccountId" TEXT,
    "paymentAccountId" TEXT,
    "sequenceCode" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_items" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "analyticAccountId" TEXT,
    "description" TEXT,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 5,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "reference" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "amountUntaxed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxId" TEXT,
    "analyticAccountId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "quantityBilled" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "vendorReference" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "journalId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "amountUntaxed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountResidual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "accountId" TEXT NOT NULL,
    "taxId" TEXT,
    "analyticAccountId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "reference" TEXT,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "amountUntaxed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxId" TEXT,
    "analyticAccountId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "quantityInvoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "reference" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "journalId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "amountUntaxed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountResidual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "accountId" TEXT NOT NULL,
    "taxId" TEXT,
    "analyticAccountId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "contactId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountUnallocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "vendorBillId" TEXT,
    "customerInvoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytic_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AnalyticAccountType" NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytic_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "responsibleUserId" TEXT,
    "revisionOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "analyticAccountId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "AnalyticAccountType" NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "committedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "achievedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_moves" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "moveType" "StockMoveType" NOT NULL,
    "direction" "StockMoveDirection" NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_contactId_key" ON "users"("contactId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "auth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionToken_key" ON "auth_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_token_key" ON "auth_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_identifier_token_key" ON "auth_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "contacts_type_isArchived_idx" ON "contacts"("type", "isArchived");

-- CreateIndex
CREATE INDEX "contacts_name_idx" ON "contacts"("name");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_isArchived_idx" ON "products"("isArchived");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_type_isArchived_idx" ON "products"("type", "isArchived");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "taxes_name_key" ON "taxes"("name");

-- CreateIndex
CREATE INDEX "taxes_scope_isArchived_idx" ON "taxes"("scope", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_accounts_type_isArchived_idx" ON "ledger_accounts"("type", "isArchived");

-- CreateIndex
CREATE INDEX "ledger_accounts_kind_idx" ON "ledger_accounts"("kind");

-- CreateIndex
CREATE INDEX "ledger_accounts_parentId_idx" ON "ledger_accounts"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "journals_code_key" ON "journals"("code");

-- CreateIndex
CREATE INDEX "journals_type_isArchived_idx" ON "journals"("type", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_number_key" ON "journal_entries"("number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversalOfId_key" ON "journal_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");

-- CreateIndex
CREATE INDEX "journal_entries_status_date_idx" ON "journal_entries"("status", "date");

-- CreateIndex
CREATE INDEX "journal_entries_journalId_idx" ON "journal_entries"("journalId");

-- CreateIndex
CREATE INDEX "journal_entries_sourceType_sourceId_idx" ON "journal_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entries_createdById_idx" ON "journal_entries"("createdById");

-- CreateIndex
CREATE INDEX "journal_items_accountId_status_date_idx" ON "journal_items"("accountId", "status", "date");

-- CreateIndex
CREATE INDEX "journal_items_journalEntryId_idx" ON "journal_items"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_items_contactId_idx" ON "journal_items"("contactId");

-- CreateIndex
CREATE INDEX "journal_items_analyticAccountId_status_date_idx" ON "journal_items"("analyticAccountId", "status", "date");

-- CreateIndex
CREATE INDEX "journal_items_date_idx" ON "journal_items"("date");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_code_key" ON "sequences"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_vendorId_status_idx" ON "purchase_orders"("vendorId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_orderDate_idx" ON "purchase_orders"("orderDate");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_order_lines_orderId_idx" ON "purchase_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_productId_idx" ON "purchase_order_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_number_key" ON "vendor_bills"("number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_journalEntryId_key" ON "vendor_bills"("journalEntryId");

-- CreateIndex
CREATE INDEX "vendor_bills_vendorId_status_idx" ON "vendor_bills"("vendorId", "status");

-- CreateIndex
CREATE INDEX "vendor_bills_invoiceDate_idx" ON "vendor_bills"("invoiceDate");

-- CreateIndex
CREATE INDEX "vendor_bills_status_idx" ON "vendor_bills"("status");

-- CreateIndex
CREATE INDEX "vendor_bills_dueDate_idx" ON "vendor_bills"("dueDate");

-- CreateIndex
CREATE INDEX "vendor_bills_purchaseOrderId_idx" ON "vendor_bills"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "vendor_bill_lines_billId_idx" ON "vendor_bill_lines"("billId");

-- CreateIndex
CREATE INDEX "vendor_bill_lines_productId_idx" ON "vendor_bill_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_key" ON "sales_orders"("number");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_status_idx" ON "sales_orders"("customerId", "status");

-- CreateIndex
CREATE INDEX "sales_orders_orderDate_idx" ON "sales_orders"("orderDate");

-- CreateIndex
CREATE INDEX "sales_orders_status_idx" ON "sales_orders"("status");

-- CreateIndex
CREATE INDEX "sales_order_lines_orderId_idx" ON "sales_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "sales_order_lines_productId_idx" ON "sales_order_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_number_key" ON "customer_invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_journalEntryId_key" ON "customer_invoices"("journalEntryId");

-- CreateIndex
CREATE INDEX "customer_invoices_customerId_status_idx" ON "customer_invoices"("customerId", "status");

-- CreateIndex
CREATE INDEX "customer_invoices_invoiceDate_idx" ON "customer_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "customer_invoices_status_idx" ON "customer_invoices"("status");

-- CreateIndex
CREATE INDEX "customer_invoices_dueDate_idx" ON "customer_invoices"("dueDate");

-- CreateIndex
CREATE INDEX "customer_invoices_salesOrderId_idx" ON "customer_invoices"("salesOrderId");

-- CreateIndex
CREATE INDEX "customer_invoice_lines_invoiceId_idx" ON "customer_invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "customer_invoice_lines_productId_idx" ON "customer_invoice_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_number_key" ON "payments"("number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_journalEntryId_key" ON "payments"("journalEntryId");

-- CreateIndex
CREATE INDEX "payments_contactId_status_idx" ON "payments"("contactId", "status");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_direction_status_idx" ON "payments"("direction", "status");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_vendorBillId_idx" ON "payment_allocations"("vendorBillId");

-- CreateIndex
CREATE INDEX "payment_allocations_customerInvoiceId_idx" ON "payment_allocations"("customerInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "analytic_accounts_code_key" ON "analytic_accounts"("code");

-- CreateIndex
CREATE INDEX "analytic_accounts_type_isArchived_idx" ON "analytic_accounts"("type", "isArchived");

-- CreateIndex
CREATE INDEX "analytic_accounts_name_idx" ON "analytic_accounts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_revisionOfId_key" ON "budgets"("revisionOfId");

-- CreateIndex
CREATE INDEX "budgets_periodStart_periodEnd_idx" ON "budgets"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "budgets_status_idx" ON "budgets"("status");

-- CreateIndex
CREATE INDEX "budgets_responsibleUserId_idx" ON "budgets"("responsibleUserId");

-- CreateIndex
CREATE INDEX "budget_lines_budgetId_idx" ON "budget_lines"("budgetId");

-- CreateIndex
CREATE INDEX "budget_lines_analyticAccountId_idx" ON "budget_lines"("analyticAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budgetId_analyticAccountId_accountId_key" ON "budget_lines"("budgetId", "analyticAccountId", "accountId");

-- CreateIndex
CREATE INDEX "stock_moves_productId_date_idx" ON "stock_moves"("productId", "date");

-- CreateIndex
CREATE INDEX "stock_moves_sourceType_sourceId_idx" ON "stock_moves"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "stock_moves_date_idx" ON "stock_moves"("date");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_receivableAccountId_fkey" FOREIGN KEY ("receivableAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_incomeAccountId_fkey" FOREIGN KEY ("incomeAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_stockAccountId_fkey" FOREIGN KEY ("stockAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_cogsAccountId_fkey" FOREIGN KEY ("cogsAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_salesTaxId_fkey" FOREIGN KEY ("salesTaxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_purchaseTaxId_fkey" FOREIGN KEY ("purchaseTaxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_collectedAccountId_fkey" FOREIGN KEY ("collectedAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_paidAccountId_fkey" FOREIGN KEY ("paidAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultDebitAccountId_fkey" FOREIGN KEY ("defaultDebitAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_defaultCreditAccountId_fkey" FOREIGN KEY ("defaultCreditAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_customerInvoiceId_fkey" FOREIGN KEY ("customerInvoiceId") REFERENCES "customer_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_analyticAccountId_fkey" FOREIGN KEY ("analyticAccountId") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

