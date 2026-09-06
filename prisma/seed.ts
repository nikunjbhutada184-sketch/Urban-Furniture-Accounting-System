/**
 * Database seed.
 *
 * Idempotent: every write is an upsert keyed on a stable business key, so the
 * script can be run repeatedly against the same database.
 *
 * Reference data (accounts, journals, sequences, taxes) is safe everywhere.
 * Sample master data and development logins are only created outside
 * production, unless ALLOW_PRODUCTION_SEED=true is set explicitly.
 */

import {
  AccountKind,
  AccountType,
  AnalyticAccountType,
  BudgetStatus,
  ContactType,
  JournalType,
  PrismaClient,
  ProductType,
  TaxScope,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === "production";
const seedSampleData = !isProduction || process.env.ALLOW_PRODUCTION_SEED === "true";

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------

type AccountSeed = {
  code: string;
  name: string;
  type: AccountType;
  kind: AccountKind;
  parentCode?: string;
  isReconcilable?: boolean;
  description?: string;
};

const ACCOUNTS: AccountSeed[] = [
  // --- Assets ---
  { code: "1000", name: "Assets", type: AccountType.ASSET, kind: AccountKind.OTHER },
  {
    code: "1010",
    name: "Cash",
    type: AccountType.ASSET,
    kind: AccountKind.CASH,
    parentCode: "1000",
    description: "Cash on hand",
  },
  {
    code: "1020",
    name: "Bank",
    type: AccountType.ASSET,
    kind: AccountKind.BANK,
    parentCode: "1000",
    description: "Current account",
  },
  {
    code: "1100",
    name: "Debtors",
    type: AccountType.ASSET,
    kind: AccountKind.RECEIVABLE,
    parentCode: "1000",
    isReconcilable: true,
    description: "Accounts receivable - money owed by customers",
  },
  {
    code: "1200",
    name: "Inventory",
    type: AccountType.ASSET,
    kind: AccountKind.INVENTORY,
    parentCode: "1000",
    description: "Stock of finished goods",
  },
  {
    code: "1300",
    name: "Input Tax Credit",
    type: AccountType.ASSET,
    kind: AccountKind.TAX_RECEIVABLE,
    parentCode: "1000",
    description: "Tax paid on purchases, recoverable",
  },

  // --- Liabilities ---
  { code: "2000", name: "Liabilities", type: AccountType.LIABILITY, kind: AccountKind.OTHER },
  {
    code: "2100",
    name: "Creditors",
    type: AccountType.LIABILITY,
    kind: AccountKind.PAYABLE,
    parentCode: "2000",
    isReconcilable: true,
    description: "Accounts payable - money owed to vendors",
  },
  {
    code: "2200",
    name: "Tax Payable",
    type: AccountType.LIABILITY,
    kind: AccountKind.TAX_PAYABLE,
    parentCode: "2000",
    description: "Tax collected on sales, payable to the authority",
  },

  // --- Capital ---
  { code: "3000", name: "Capital", type: AccountType.CAPITAL, kind: AccountKind.OTHER },
  {
    code: "3100",
    name: "Owner's Capital",
    type: AccountType.CAPITAL,
    kind: AccountKind.CAPITAL,
    parentCode: "3000",
  },
  {
    code: "3200",
    name: "Retained Earnings",
    type: AccountType.CAPITAL,
    kind: AccountKind.RETAINED_EARNINGS,
    parentCode: "3000",
    description: "Accumulated profit from prior periods",
  },

  // --- Income ---
  { code: "4000", name: "Income", type: AccountType.INCOME, kind: AccountKind.OTHER },
  {
    code: "4100",
    name: "Sales Income",
    type: AccountType.INCOME,
    kind: AccountKind.INCOME,
    parentCode: "4000",
    description: "Revenue from furniture sales",
  },
  {
    code: "4200",
    name: "Other Income",
    type: AccountType.INCOME,
    kind: AccountKind.OTHER_INCOME,
    parentCode: "4000",
  },

  // --- Expenses ---
  { code: "5000", name: "Expenses", type: AccountType.EXPENSE, kind: AccountKind.OTHER },
  {
    code: "5100",
    name: "Purchases Expense",
    type: AccountType.EXPENSE,
    kind: AccountKind.EXPENSE,
    parentCode: "5000",
    description: "Goods bought for resale",
  },
  {
    code: "5200",
    name: "Cost of Goods Sold",
    type: AccountType.EXPENSE,
    kind: AccountKind.COST_OF_GOODS_SOLD,
    parentCode: "5000",
  },
  {
    code: "5300",
    name: "Operating Expenses",
    type: AccountType.EXPENSE,
    kind: AccountKind.EXPENSE,
    parentCode: "5000",
    description: "Rent, salaries, utilities, transport",
  },
];

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

const SEQUENCES = [
  { code: "purchase_order", prefix: "PO/", padding: 5 },
  { code: "vendor_bill", prefix: "BILL/", padding: 5 },
  { code: "sales_order", prefix: "SO/", padding: 5 },
  { code: "customer_invoice", prefix: "INV/", padding: 5 },
  { code: "payment_inbound", prefix: "RCPT/", padding: 5 },
  { code: "payment_outbound", prefix: "PAY/", padding: 5 },
  { code: "journal_entry", prefix: "JE/", padding: 5 },
];

async function main() {
  console.log("Seeding Urban Furniture accounting database...\n");

  // -------------------------------------------------------------------------
  // 1. Chart of Accounts (parents first so parentCode resolves)
  // -------------------------------------------------------------------------
  const accountIdByCode = new Map<string, string>();

  for (const account of ACCOUNTS) {
    const parentId = account.parentCode ? accountIdByCode.get(account.parentCode) : undefined;

    const record = await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        type: account.type,
        kind: account.kind,
        parentId: parentId ?? null,
        isReconcilable: account.isReconcilable ?? false,
        description: account.description ?? null,
      },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        kind: account.kind,
        parentId: parentId ?? null,
        isReconcilable: account.isReconcilable ?? false,
        description: account.description ?? null,
      },
    });

    accountIdByCode.set(account.code, record.id);
  }
  console.log(`  Chart of Accounts   ${ACCOUNTS.length} accounts`);

  const account = (code: string): string => {
    const id = accountIdByCode.get(code);
    if (!id) throw new Error(`Seed error: account ${code} was not created.`);
    return id;
  };

  // -------------------------------------------------------------------------
  // 2. Company settings
  // -------------------------------------------------------------------------
  const companyDefaults = {
    name: process.env.COMPANY_NAME ?? "Urban Furniture",
    currencyCode: process.env.COMPANY_CURRENCY ?? "INR",
    currencySymbol: process.env.COMPANY_CURRENCY_SYMBOL ?? "Rs.",
    fiscalYearStartMonth: Number(process.env.FISCAL_YEAR_START_MONTH ?? 4),
    defaultReceivableAccountId: account("1100"),
    defaultPayableAccountId: account("2100"),
    defaultIncomeAccountId: account("4100"),
    defaultExpenseAccountId: account("5100"),
    defaultTaxPayableAccountId: account("2200"),
    defaultTaxInputAccountId: account("1300"),
  };

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: companyDefaults,
    create: { id: "company", ...companyDefaults },
  });
  console.log(`  Company settings    ${companyDefaults.name} (${companyDefaults.currencyCode})`);

  // -------------------------------------------------------------------------
  // 3. Sequences
  // -------------------------------------------------------------------------
  for (const sequence of SEQUENCES) {
    await prisma.sequence.upsert({
      where: { code: sequence.code },
      // Never reset nextValue on an existing sequence: numbers already issued
      // must not be reused.
      update: { prefix: sequence.prefix, padding: sequence.padding },
      create: { ...sequence, nextValue: 1 },
    });
  }
  console.log(`  Sequences           ${SEQUENCES.length} series`);

  // -------------------------------------------------------------------------
  // 4. Taxes
  // -------------------------------------------------------------------------
  const TAXES = [
    { name: "GST 5%", rate: "5.0000" },
    { name: "GST 12%", rate: "12.0000" },
    { name: "GST 18%", rate: "18.0000" },
  ];

  const taxIdByName = new Map<string, string>();
  for (const tax of TAXES) {
    const record = await prisma.tax.upsert({
      where: { name: tax.name },
      update: {
        rate: tax.rate,
        scope: TaxScope.BOTH,
        collectedAccountId: account("2200"),
        paidAccountId: account("1300"),
      },
      create: {
        name: tax.name,
        rate: tax.rate,
        scope: TaxScope.BOTH,
        collectedAccountId: account("2200"),
        paidAccountId: account("1300"),
      },
    });
    taxIdByName.set(tax.name, record.id);
  }
  console.log(`  Taxes               ${TAXES.length} rates`);

  // -------------------------------------------------------------------------
  // 5. Journals
  // -------------------------------------------------------------------------
  const JOURNALS = [
    {
      code: "SAL",
      name: "Sales Journal",
      type: JournalType.SALES,
      defaultDebitAccountId: account("1100"), // Debtors
      defaultCreditAccountId: account("4100"), // Sales Income
      paymentAccountId: null,
      sequenceCode: "customer_invoice",
    },
    {
      code: "PUR",
      name: "Purchase Journal",
      type: JournalType.PURCHASE,
      defaultDebitAccountId: account("5100"), // Purchases Expense
      defaultCreditAccountId: account("2100"), // Creditors
      paymentAccountId: null,
      sequenceCode: "vendor_bill",
    },
    {
      code: "BNK",
      name: "Bank Journal",
      type: JournalType.BANK,
      defaultDebitAccountId: account("1020"),
      defaultCreditAccountId: account("1020"),
      paymentAccountId: account("1020"), // Bank
      sequenceCode: "journal_entry",
    },
    {
      code: "CSH",
      name: "Cash Journal",
      type: JournalType.CASH,
      defaultDebitAccountId: account("1010"),
      defaultCreditAccountId: account("1010"),
      paymentAccountId: account("1010"), // Cash
      sequenceCode: "journal_entry",
    },
    {
      code: "MISC",
      name: "Miscellaneous Journal",
      type: JournalType.MISCELLANEOUS,
      defaultDebitAccountId: null,
      defaultCreditAccountId: null,
      paymentAccountId: null,
      sequenceCode: "journal_entry",
    },
  ];

  for (const journal of JOURNALS) {
    await prisma.journal.upsert({
      where: { code: journal.code },
      update: journal,
      create: journal,
    });
  }
  console.log(`  Journals            ${JOURNALS.map((j) => j.code).join(", ")}`);

  // -------------------------------------------------------------------------
  // 6. Analytic accounts
  // -------------------------------------------------------------------------
  const ANALYTIC_ACCOUNTS = [
    { code: "AA-RETAIL", name: "Retail Showroom", type: AnalyticAccountType.INCOME },
    { code: "AA-WHOLESALE", name: "Wholesale & Contracts", type: AnalyticAccountType.INCOME },
    { code: "AA-OPS", name: "Showroom Operations", type: AnalyticAccountType.EXPENSE },
    { code: "AA-LOGISTICS", name: "Logistics & Delivery", type: AnalyticAccountType.EXPENSE },
  ];

  const analyticIdByCode = new Map<string, string>();
  for (const analytic of ANALYTIC_ACCOUNTS) {
    const record = await prisma.analyticAccount.upsert({
      where: { code: analytic.code },
      update: { name: analytic.name, type: analytic.type },
      create: analytic,
    });
    analyticIdByCode.set(analytic.code, record.id);
  }
  console.log(`  Analytic accounts   ${ANALYTIC_ACCOUNTS.length} accounts`);

  if (!seedSampleData) {
    console.log("\nProduction environment: skipping sample master data and dev logins.");
    console.log("Set ALLOW_PRODUCTION_SEED=true to override.\n");
    return;
  }

  // -------------------------------------------------------------------------
  // 7. Product categories and products
  // -------------------------------------------------------------------------
  const categoryIdByName = new Map<string, string>();
  for (const name of ["Seating", "Tables", "Living Room", "Services"]) {
    const record = await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryIdByName.set(name, record.id);
  }

  const gst18 = taxIdByName.get("GST 18%") ?? null;

  const PRODUCTS = [
    {
      sku: "UF-CHAIR-001",
      name: "Office Chair",
      type: ProductType.GOODS,
      salesPrice: "4500.0000",
      cost: "3000.0000",
      category: "Seating",
      trackInventory: true,
    },
    {
      sku: "UF-TABLE-001",
      name: "Wooden Table",
      type: ProductType.GOODS,
      salesPrice: "12000.0000",
      cost: "8000.0000",
      category: "Tables",
      trackInventory: true,
    },
    {
      sku: "UF-SOFA-001",
      name: "Sofa",
      type: ProductType.GOODS,
      salesPrice: "25000.0000",
      cost: "17500.0000",
      category: "Living Room",
      trackInventory: true,
    },
    {
      sku: "UF-TABLE-002",
      name: "Dining Table",
      type: ProductType.GOODS,
      salesPrice: "18000.0000",
      cost: "12500.0000",
      category: "Tables",
      trackInventory: true,
    },
    {
      sku: "UF-SVC-ASSEMBLY",
      name: "Furniture Assembly",
      type: ProductType.SERVICE,
      salesPrice: "1500.0000",
      cost: "0.0000",
      category: "Services",
      trackInventory: false,
    },
    {
      sku: "UF-SVC-DELIVERY",
      name: "Delivery & Installation",
      type: ProductType.SERVICE,
      salesPrice: "2000.0000",
      cost: "1200.0000",
      category: "Services",
      trackInventory: false,
    },
  ];

  for (const product of PRODUCTS) {
    const data = {
      name: product.name,
      type: product.type,
      salesPrice: product.salesPrice,
      cost: product.cost,
      categoryId: categoryIdByName.get(product.category) ?? null,
      incomeAccountId: account("4100"),
      expenseAccountId: account("5100"),
      stockAccountId: product.trackInventory ? account("1200") : null,
      cogsAccountId: product.trackInventory ? account("5200") : null,
      salesTaxId: gst18,
      purchaseTaxId: gst18,
      trackInventory: product.trackInventory,
    };

    await prisma.product.upsert({
      where: { sku: product.sku },
      update: data,
      create: { sku: product.sku, ...data },
    });
  }
  console.log(`  Products            ${PRODUCTS.map((p) => p.name).join(", ")}`);

  // -------------------------------------------------------------------------
  // 8. Contacts (fixed ids keep the seed idempotent - names are not unique)
  // -------------------------------------------------------------------------
  const CONTACTS = [
    {
      id: "seed_contact_azure",
      name: "Azure Furniture",
      type: ContactType.VENDOR,
      email: "accounts@azurefurniture.test",
      mobile: "+91 98200 11111",
      addressLine1: "Plot 14, Furniture Park",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380015",
    },
    {
      id: "seed_contact_rahul",
      name: "Rahul Sharma",
      type: ContactType.VENDOR,
      email: "rahul.sharma@example.test",
      mobile: "+91 98200 22222",
      addressLine1: "22 Timber Lane",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302001",
    },
    {
      id: "seed_contact_nimesh",
      name: "Nimesh Pathak",
      type: ContactType.CUSTOMER,
      email: "nimesh.pathak@example.test",
      mobile: "+91 98200 33333",
      addressLine1: "7 Lake View Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
    {
      id: "seed_contact_priya",
      name: "Priya Desai Interiors",
      type: ContactType.BOTH,
      email: "priya@desaiinteriors.test",
      mobile: "+91 98200 44444",
      addressLine1: "3rd Floor, Design House",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    },
  ];

  for (const contact of CONTACTS) {
    const { id, ...rest } = contact;
    const data = {
      ...rest,
      receivableAccountId: contact.type === ContactType.VENDOR ? null : account("1100"),
      payableAccountId: contact.type === ContactType.CUSTOMER ? null : account("2100"),
    };
    await prisma.contact.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }
  console.log(`  Contacts            ${CONTACTS.map((c) => c.name).join(", ")}`);

  // -------------------------------------------------------------------------
  // 9. Sample budget
  // -------------------------------------------------------------------------
  const fiscalYear = new Date().getUTCFullYear();
  const budget = await prisma.budget.upsert({
    where: { id: "seed_budget_fy" },
    update: {},
    create: {
      id: "seed_budget_fy",
      name: `Annual Budget ${fiscalYear}`,
      periodStart: new Date(Date.UTC(fiscalYear, 3, 1)), // 1 April
      periodEnd: new Date(Date.UTC(fiscalYear + 1, 2, 31)), // 31 March
      status: BudgetStatus.DRAFT,
    },
  });

  const BUDGET_LINES = [
    { analytic: "AA-RETAIL", type: AnalyticAccountType.INCOME, planned: "2500000.00" },
    { analytic: "AA-WHOLESALE", type: AnalyticAccountType.INCOME, planned: "1800000.00" },
    { analytic: "AA-OPS", type: AnalyticAccountType.EXPENSE, planned: "600000.00" },
    { analytic: "AA-LOGISTICS", type: AnalyticAccountType.EXPENSE, planned: "350000.00" },
  ];

  for (const line of BUDGET_LINES) {
    const analyticAccountId = analyticIdByCode.get(line.analytic);
    if (!analyticAccountId) continue;

    const existing = await prisma.budgetLine.findFirst({
      where: { budgetId: budget.id, analyticAccountId, accountId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.budgetLine.update({
        where: { id: existing.id },
        data: { plannedAmount: line.planned, type: line.type },
      });
    } else {
      await prisma.budgetLine.create({
        data: {
          budgetId: budget.id,
          analyticAccountId,
          type: line.type,
          plannedAmount: line.planned,
        },
      });
    }
  }
  console.log(`  Budget              ${budget.name} (${BUDGET_LINES.length} lines)`);

  // -------------------------------------------------------------------------
  // 10. Development users
  // -------------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@urbanfurniture.test";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123";
  const accountantEmail = process.env.SEED_ACCOUNTANT_EMAIL ?? "accountant@urbanfurniture.test";
  const accountantPassword = process.env.SEED_ACCOUNTANT_PASSWORD ?? "ChangeMe!123";

  const adminLoginId = process.env.SEED_ADMIN_LOGIN_ID ?? "ufowner";
  const accountantLoginId = process.env.SEED_ACCOUNTANT_LOGIN_ID ?? "ufaccounts";

  const USERS = [
    {
      loginId: adminLoginId,
      email: adminEmail,
      name: "Urban Furniture Owner",
      role: UserRole.ADMIN,
      password: adminPassword,
      contactId: null as string | null,
    },
    {
      loginId: accountantLoginId,
      email: accountantEmail,
      name: "Accountant",
      role: UserRole.ACCOUNTANT,
      password: accountantPassword,
      contactId: null as string | null,
    },
    {
      loginId: "nimeshp",
      email: "nimesh.pathak@example.test",
      name: "Nimesh Pathak",
      role: UserRole.CONTACT,
      password: "ChangeMe!123",
      contactId: "seed_contact_nimesh",
    },
  ];

  for (const user of USERS) {
    const passwordHash = bcrypt.hashSync(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        loginId: user.loginId,
        name: user.name,
        role: user.role,
        contactId: user.contactId,
        isActive: true,
      },
      create: {
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        contactId: user.contactId,
      },
    });
  }

  console.log(`  Users               ${USERS.map((u) => `${u.loginId} (${u.role})`).join(", ")}`);
  console.log("\nDevelopment logins (change these before any real deployment):");
  console.log(`  ADMIN       ${adminLoginId} / ${adminPassword}`);
  console.log(`  ACCOUNTANT  ${accountantLoginId} / ${accountantPassword}`);
  console.log(`  CONTACT     nimeshp / ChangeMe!123`);
  console.log("\nSeed complete.\n");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
