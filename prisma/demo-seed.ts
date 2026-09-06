import {
  AccountKind,
  AccountType,
  AnalyticAccountType,
  ContactType,
  JournalType,
  PaymentDirection,
  PrismaClient,
  ProductType,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Demo data.
 *
 * Fills every section with a few hundred rows so the screens, filters, paging
 * and reports can be shown with something in them.
 *
 * The one rule that matters here: **nothing writes to the ledger directly.**
 * Every order, bill, invoice and payment goes through the same services the
 * application uses, so the demo database obeys the same invariants as a real
 * one — entries balance, residuals are derived, budgets recompute, and the
 * trial balance still reconciles afterwards. Bulk-inserting journal items
 * would be far faster and would quietly destroy all of that.
 *
 * Run with:  npm run db:demo          (add -- --force to top up again)
 */

import { createAccount } from "../src/modules/accounts/account-service";
import { createAnalyticAccount } from "../src/modules/analytic/analytic-service";
import { createBudget, confirmBudget, cancelBudget } from "../src/modules/budgets/budget-service";
import { createContact } from "../src/modules/contacts/contact-service";
import { createJournal } from "../src/modules/journals/journal-service";
import { registerPayment } from "../src/modules/payments/payment-registration";
import { createProduct } from "../src/modules/products/product-service";
import {
  createBillFromPurchaseOrder,
  postVendorBill,
} from "../src/modules/purchases/vendor-bill-service";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
} from "../src/modules/purchases/purchase-order-service";
import {
  createInvoiceFromSalesOrder,
  postCustomerInvoice,
} from "../src/modules/sales/customer-invoice-service";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
} from "../src/modules/sales/sales-order-service";
import { postJournalEntry } from "../src/server/accounting";

const prisma = new PrismaClient();

/**
 * How big each section is.
 *
 * Sized to what a furniture business of this shape would plausibly have, not to
 * a round number. Two hundred customers is ordinary; two hundred *journals* or
 * two hundred budgets is not -- a real ledger has a handful of each, and a wall
 * of them makes the screens harder to read rather than more impressive.
 *
 * `DEMO_SCALE` shrinks everything proportionally, for a quick smoke run.
 */
const SCALE = Number(process.env.DEMO_SCALE ?? 1);
const sized = (base: number) => Math.max(1, Math.round(base * SCALE));

const COUNTS = {
  /** A year's customer and vendor base. */
  contacts: sized(200),
  /** A furniture catalogue. */
  products: sized(150),
  /** On top of the 19 the main seed creates, for ~55 in total. */
  accounts: sized(36),
  /** On top of the seed's 5: a second bank and a couple of specialised books. */
  journals: sized(3),
  /** Cost centres and projects, on top of the seed's 4. */
  analytics: sized(14),
  /** Staff logins, on top of the seed's 3. */
  users: sized(9),
  /** A year of trading. */
  salesOrders: sized(200),
  /** Buying happens in fewer, larger orders than selling. */
  purchaseOrders: sized(120),
  /** Manual adjustments: roughly two a month, not two hundred. */
  journalEntries: sized(24),
  /** Quarterly budgets across a few cost centres. */
  budgets: sized(12),
} as const;

/** Extra orders left in draft or cancelled, so the status filters find something. */
const extraDraft = (base: number) => Math.max(Math.round(base * 0.125), 1);
const extraCancelled = (base: number) => Math.max(Math.round(base * 0.075), 1);

const FORCE = process.argv.includes("--force");

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * A seeded PRNG, so two runs produce the same database.
 *
 * `Math.random` would make a failure impossible to reproduce and every run's
 * reports different, which is the opposite of what a demo fixture is for.
 */
function makeRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

const random = makeRandom(20260906);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** `count` different items, for places where a repeat would be rejected. */
function pickDistinct<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const chosen: T[] = [];

  while (chosen.length < count && pool.length > 0) {
    chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  }

  return chosen;
}
/** A money string, never a float in disguise. */
const money = (min: number, max: number, step = 50) =>
  (between(Math.ceil(min / step), Math.floor(max / step)) * step).toFixed(2);

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const FIRST = [
  "Aarav",
  "Priya",
  "Rohan",
  "Neha",
  "Vikram",
  "Ananya",
  "Karan",
  "Meera",
  "Arjun",
  "Divya",
  "Sameer",
  "Kavya",
  "Nikhil",
  "Ishita",
  "Rahul",
  "Sneha",
  "Aditya",
  "Pooja",
  "Manish",
  "Tara",
];
const LAST = [
  "Sharma",
  "Patel",
  "Desai",
  "Iyer",
  "Nair",
  "Reddy",
  "Kulkarni",
  "Mehta",
  "Joshi",
  "Rao",
  "Bhatt",
  "Chopra",
  "Sinha",
  "Gupta",
  "Verma",
  "Shah",
  "Menon",
  "Pillai",
  "Kapoor",
  "Bose",
];
const FIRMS = [
  "Interiors",
  "Furnishings",
  "Woodworks",
  "Living",
  "Spaces",
  "Décor",
  "Home",
  "Studio",
  "Contracts",
  "Trading",
];
const CITIES: [string, string, string][] = [
  ["Mumbai", "Maharashtra", "400001"],
  ["Pune", "Maharashtra", "411001"],
  ["Bengaluru", "Karnataka", "560001"],
  ["Chennai", "Tamil Nadu", "600001"],
  ["Hyderabad", "Telangana", "500001"],
  ["Ahmedabad", "Gujarat", "380001"],
  ["Jaipur", "Rajasthan", "302001"],
  ["Kolkata", "West Bengal", "700001"],
  ["Delhi", "Delhi", "110001"],
  ["Kochi", "Kerala", "682001"],
];

const MATERIALS = [
  "Teak",
  "Oak",
  "Walnut",
  "Sheesham",
  "Mango Wood",
  "Rattan",
  "Bamboo",
  "Marble",
  "Glass",
  "Steel",
];
const FURNITURE = [
  "Dining Table",
  "Office Chair",
  "Sofa",
  "Bookshelf",
  "Wardrobe",
  "Coffee Table",
  "Bed Frame",
  "Sideboard",
  "Recliner",
  "Study Desk",
  "Bar Stool",
  "TV Unit",
  "Shoe Rack",
  "Dressing Table",
  "Bench",
];
const SERVICES = [
  "Assembly",
  "Delivery",
  "Polishing",
  "Upholstery Repair",
  "Interior Consultation",
  "Installation",
  "Fabric Protection",
  "Site Measurement",
];

/** The few extra books a furniture business would plausibly keep. */
const EXTRA_JOURNALS: [string, string][] = [
  ["Online Sales", "SALES"],
  ["Import Purchases", "PURCHASE"],
  ["Year-end Adjustments", "MISCELLANEOUS"],
  ["Showroom Sales", "SALES"],
  ["Consumables", "PURCHASE"],
  ["Depreciation", "MISCELLANEOUS"],
];

const PROJECTS = [
  "Retail Floor",
  "Online Store",
  "Corporate Fitout",
  "Export Orders",
  "Showroom",
  "Workshop",
  "Logistics",
  "Marketing",
  "Custom Builds",
  "Refurbishment",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FY_START = new Date(Date.UTC(2026, 3, 1)); // 1 April 2026 — after the lock date.
const FY_DAYS = 330;

/** A date inside the current financial year, offset by whole days. */
function fyDate(dayOffset: number): Date {
  return new Date(FY_START.getTime() + dayOffset * 86_400_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Runs `task` for each item, reporting progress on one line. */
async function forEachWithProgress<T>(
  label: string,
  items: T[],
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const started = Date.now();
  let failures = 0;

  for (const [index, item] of items.entries()) {
    try {
      await task(item, index);
    } catch (error) {
      failures += 1;
      // Keep going: one bad row should not abandon a 200-row section, but the
      // failure is surfaced rather than swallowed.
      if (failures <= 3) {
        console.error(`\n  ! ${label} #${index} failed:`, (error as Error).message);
      }
    }

    if ((index + 1) % 25 === 0 || index === items.length - 1) {
      process.stdout.write(`\r  ${label}: ${index + 1}/${items.length}   `);
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const suffix = failures > 0 ? ` (${failures} failed)` : "";
  console.log(`\r  ${label}: ${items.length}/${items.length} in ${seconds}s${suffix}`);
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to write demo data to a production database.");
  }

  const existing = await prisma.contact.count({ where: { name: { startsWith: "DEMO " } } });
  if (existing > 0 && !FORCE) {
    console.log(
      `\nThis database already has ${existing} demo contacts.\n` +
        "Re-run with `-- --force` to add another batch, or `npm run db:reset` to start clean.\n",
    );
    return;
  }

  /**
   * Where this batch starts numbering.
   *
   * Codes and SKUs are derived from the row index, so a second run would
   * collide with the first. Offsetting past what is already there makes
   * `--force` genuinely additive instead of noisily half-failing.
   */
  const offset = await prisma.product.count({ where: { sku: { startsWith: "DEMO-" } } });
  const seq = (index: number) => index + offset;

  console.log(`
Generating demo data${offset > 0 ? `, numbering from ${offset}` : ""}...
`);
  const startedAt = Date.now();

  // -------------------------------------------------------------------------
  // Reference data that already exists from the main seed
  // -------------------------------------------------------------------------
  const [salesJournal, purchaseJournal, generalJournal, bankJournals, cashJournals] =
    await Promise.all([
      prisma.journal.findFirstOrThrow({ where: { type: JournalType.SALES } }),
      prisma.journal.findFirstOrThrow({ where: { type: JournalType.PURCHASE } }),
      prisma.journal.findFirstOrThrow({ where: { type: JournalType.MISCELLANEOUS } }),
      prisma.journal.findMany({
        where: { type: JournalType.BANK, paymentAccountId: { not: null } },
      }),
      prisma.journal.findMany({
        where: { type: JournalType.CASH, paymentAccountId: { not: null } },
      }),
    ]);

  const paymentJournals = [...bankJournals, ...cashJournals];
  if (paymentJournals.length === 0) {
    throw new Error("No bank or cash journal with a payment account. Run `npm run db:seed` first.");
  }

  const [salesTaxes, purchaseTaxes, admin] = await Promise.all([
    prisma.tax.findMany({ where: { scope: { in: ["SALE", "BOTH"] }, isArchived: false } }),
    prisma.tax.findMany({ where: { scope: { in: ["PURCHASE", "BOTH"] }, isArchived: false } }),
    prisma.user.findFirstOrThrow({ where: { role: UserRole.ADMIN } }),
  ]);

  const context = { userId: admin.id };

  // -------------------------------------------------------------------------
  // 1. Chart of accounts
  // -------------------------------------------------------------------------
  const accountPlan: [AccountType, AccountKind, string][] = [
    [AccountType.ASSET, AccountKind.OTHER, "Asset"],
    [AccountType.LIABILITY, AccountKind.OTHER, "Liability"],
    [AccountType.CAPITAL, AccountKind.OTHER, "Capital"],
    [AccountType.INCOME, AccountKind.OTHER, "Income"],
    [AccountType.EXPENSE, AccountKind.OTHER, "Expense"],
  ];

  await forEachWithProgress("Chart of accounts", range(COUNTS.accounts), async (index) => {
    const [type, kind, label] = accountPlan[index % accountPlan.length]!;

    await prisma.$transaction((tx) =>
      createAccount(
        tx,
        {
          code: `9${String(seq(index)).padStart(4, "0")}`,
          name: `DEMO ${label} ${pick(PROJECTS)} ${seq(index) + 1}`,
          type,
          kind,
          parentId: null,
          description: `Demo ${label.toLowerCase()} account for showcasing the chart of accounts.`,
          isReconcilable: false,
        },
        context,
      ),
    );
  });

  const incomeAccounts = await prisma.ledgerAccount.findMany({
    where: { type: AccountType.INCOME, isArchived: false },
    select: { id: true },
  });
  // Manual adjustments move between balance-sheet accounts, so they never
  // distort the P&L (see the journal entry section below).
  const balanceSheetAccounts = await prisma.ledgerAccount.findMany({
    where: { isArchived: false, type: { in: [AccountType.ASSET, AccountType.LIABILITY] } },
    select: { id: true, type: true },
  });

  // -------------------------------------------------------------------------
  // 2. Journals
  // -------------------------------------------------------------------------
  await forEachWithProgress("Journals", range(COUNTS.journals), async (index) => {
    // Named, not generated. Only MISCELLANEOUS, SALES and PURCHASE appear here:
    // a BANK or CASH journal needs a payment account, and a business does not
    // have a dozen bank accounts.
    const [name, type] = EXTRA_JOURNALS[index % EXTRA_JOURNALS.length]!;

    await prisma.$transaction((tx) =>
      createJournal(
        tx,
        {
          code: `DJ${String(seq(index)).padStart(3, "0")}`,
          name: `DEMO ${name} ${seq(index) + 1}`,
          type: type as JournalType,
          defaultDebitAccountId: null,
          defaultCreditAccountId: null,
          paymentAccountId: null,
          sequenceCode: null,
        },
        context,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // 3. Analytic accounts
  // -------------------------------------------------------------------------
  await forEachWithProgress("Analytic accounts", range(COUNTS.analytics), async (index) => {
    await prisma.$transaction((tx) =>
      createAnalyticAccount(
        tx,
        {
          code: `DA-${String(seq(index)).padStart(4, "0")}`,
          name: `DEMO ${pick(PROJECTS)} ${seq(index) + 1}`,
          type: index % 2 === 0 ? AnalyticAccountType.INCOME : AnalyticAccountType.EXPENSE,
        },
        context,
      ),
    );
  });

  const analyticAccounts = await prisma.analyticAccount.findMany({
    select: { id: true, type: true },
  });
  const incomeAnalytics = analyticAccounts.filter((a) => a.type === AnalyticAccountType.INCOME);
  const expenseAnalytics = analyticAccounts.filter((a) => a.type === AnalyticAccountType.EXPENSE);

  // -------------------------------------------------------------------------
  // 4. Contacts
  // -------------------------------------------------------------------------
  await forEachWithProgress("Contacts", range(COUNTS.contacts), async (index) => {
    const person = `${pick(FIRST)} ${pick(LAST)}`;
    const isFirm = random() > 0.45;
    const name = isFirm
      ? `DEMO ${pick(LAST)} ${pick(FIRMS)} ${seq(index) + 1}`
      : `DEMO ${person} ${seq(index) + 1}`;
    const [city, state, pincode] = pick(CITIES);

    // A third each way, so both sides of the ledger have partners to work with.
    const type =
      index % 3 === 0
        ? ContactType.CUSTOMER
        : index % 3 === 1
          ? ContactType.VENDOR
          : ContactType.BOTH;

    await prisma.$transaction((tx) =>
      createContact(
        tx,
        {
          name,
          type,
          email: `demo${seq(index)}@${isFirm ? "firm" : "person"}.test`,
          mobile: `+91 9${between(100000000, 999999999)}`,
          addressLine1: `${between(1, 400)} ${pick(MATERIALS)} Road`,
          addressLine2: null,
          city,
          state,
          pincode,
          profileImage: null,
          receivableAccountId: null,
          payableAccountId: null,
        },
        context,
      ),
    );
  });

  const customers = await prisma.contact.findMany({
    where: { isArchived: false, type: { in: [ContactType.CUSTOMER, ContactType.BOTH] } },
    select: { id: true },
  });
  const vendors = await prisma.contact.findMany({
    where: { isArchived: false, type: { in: [ContactType.VENDOR, ContactType.BOTH] } },
    select: { id: true },
  });

  // -------------------------------------------------------------------------
  // 5. Products
  // -------------------------------------------------------------------------
  await forEachWithProgress("Products", range(COUNTS.products), async (index) => {
    const isService = index % 5 === 4;
    const name = isService
      ? `DEMO ${pick(SERVICES)} ${seq(index) + 1}`
      : `DEMO ${pick(MATERIALS)} ${pick(FURNITURE)} ${seq(index) + 1}`;

    const cost = Number(money(1200, 24000, 100));
    // Furniture retail runs a wide markup, and it has to: under periodic
    // inventory an unsold unit is an expense the moment it is bought, so a thin
    // markup plus healthy closing stock cannot both be true.
    const salesPrice = Math.round(cost * (1.5 + random() * 0.6));

    await prisma.$transaction((tx) =>
      createProduct(
        tx,
        {
          name,
          sku: `DEMO-${String(seq(index)).padStart(4, "0")}`,
          type: isService ? ProductType.SERVICE : ProductType.GOODS,
          salesPrice: salesPrice.toFixed(2),
          cost: cost.toFixed(2),
          categoryId: null,
          newCategory: null,
          incomeAccountId: null,
          expenseAccountId: null,
          salesTaxId: null,
          purchaseTaxId: null,
          imageUrl: null,
          // Services can never be inventory-tracked; the schema refuses it.
          trackInventory: !isService && random() > 0.35,
        },
        context,
      ),
    );
  });

  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      name: true,
      salesPrice: true,
      cost: true,
      type: true,
      trackInventory: true,
    },
  });

  /** Only these move stock, so only these constrain what can be sold. */
  const trackedProductIds = new Set(
    products.filter((product) => product.trackInventory).map((product) => product.id),
  );

  /** What purchasing draws from: goods that actually go into inventory. */
  const stockableProducts = products.filter((product) => product.trackInventory);

  // -------------------------------------------------------------------------
  // 6. Users
  // -------------------------------------------------------------------------
  // Hashed once and shared: these are fixtures, they all use the same password,
  // and hashing 200 times would add half a minute for no benefit.
  const demoPasswordHash = bcrypt.hashSync("ChangeMe!123", 10);

  await forEachWithProgress("Users", range(COUNTS.users), async (index) => {
    await prisma.user.create({
      data: {
        name: `DEMO ${pick(FIRST)} ${pick(LAST)} ${seq(index) + 1}`,
        loginId: `demo${String(seq(index)).padStart(4, "0")}`,
        email: `demo.user${seq(index)}@urbanfurniture.test`,
        role: index % 10 === 0 ? UserRole.ADMIN : UserRole.ACCOUNTANT,
        passwordHash: demoPasswordHash,
        isActive: random() > 0.1,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 7. Opening capital
  // -------------------------------------------------------------------------
  /**
   * The owner puts money in before trading starts.
   *
   * Without this the demo company bought its opening stock and paid its vendors
   * with money it never had: cash bottomed at -49.7 lakh in May and the
   * dashboard reported a negative cash position all year. A business funds
   * itself before it trades, and a balance sheet with no capital is not a
   * balance sheet anyone would recognise.
   *
   * Both sides are balance-sheet accounts, so this introduces funds without
   * touching the profit and loss.
   */
  const capitalAccount =
    (await prisma.ledgerAccount.findFirst({ where: { code: "3100" } })) ??
    (await prisma.ledgerAccount.findFirstOrThrow({ where: { type: AccountType.CAPITAL } }));

  const cashAccount = await prisma.ledgerAccount.findFirstOrThrow({
    where: { kind: AccountKind.CASH },
  });
  const bankAccount = await prisma.ledgerAccount.findFirstOrThrow({
    where: { kind: AccountKind.BANK },
  });

  // Sized to cover the year's deepest cash dip with room to spare, so neither
  // account goes overdrawn at any point.
  const cashIntroduced = (6_000_000 * SCALE).toFixed(2);
  const bankIntroduced = (4_000_000 * SCALE).toFixed(2);
  const totalIntroduced = (10_000_000 * SCALE).toFixed(2);

  await forEachWithProgress("Opening capital", [0], async () => {
    await prisma.$transaction((tx) =>
      postJournalEntry(
        tx,
        {
          journalId: generalJournal.id,
          // Before the first stock purchase, which starts 55 days out.
          date: fyDate(-60),
          reference: "DEMO-CAPITAL",
          description: "Owner's capital introduced",
          lines: [
            { accountId: bankAccount.id, debit: bankIntroduced, description: "Capital into bank" },
            { accountId: cashAccount.id, debit: cashIntroduced, description: "Capital into cash" },
            {
              accountId: capitalAccount.id,
              credit: totalIntroduced,
              description: "Owner's capital",
            },
          ],
        },
        context,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // 8. Purchases: orders -> bills
  // -------------------------------------------------------------------------
  const purchaseOrderIds: string[] = [];

  /**
   * What each purchase order buys, so stock can be tallied once it is billed.
   *
   * Only billed orders create receipts, so an order left in draft or cancelled
   * must not add to what the sales phase believes is on hand.
   */
  const purchasedByOrder = new Map<
    string,
    { productId: string; quantity: number; day: number }[]
  >();

  await forEachWithProgress(
    "Purchase orders",
    range(
      COUNTS.purchaseOrders +
        extraDraft(COUNTS.purchaseOrders) +
        extraCancelled(COUNTS.purchaseOrders),
    ),
    async (index) => {
      /**
       * When this order is placed.
       *
       * The first sixth is dated BEFORE the fiscal year: a going concern opens
       * the year with stock on the shelf, not with an empty warehouse. The rest
       * is spread across the year so buying tracks selling.
       *
       * This matters more than it looks. Periodic inventory charges a purchase
       * to expense immediately, so front-loading the buying made every
       * year-to-date window show a loss even though the full year was 28%
       * profitable -- the expense had landed and the revenue had not.
       */
      const openingStockOrders = Math.round(
        (COUNTS.purchaseOrders +
          extraDraft(COUNTS.purchaseOrders) +
          extraCancelled(COUNTS.purchaseOrders)) *
          0.18,
      );

      const orderDay =
        index < openingStockOrders
          ? between(-55, -12) // February and March, before the year opens
          : between(10, FY_DAYS - 15);
      const orderDate = fyDate(orderDay);
      const bought: { productId: string; quantity: number; day: number }[] = [];

      const order = await prisma.$transaction((tx) =>
        createPurchaseOrder(
          tx,
          {
            vendorId: pick(vendors).id,
            orderDate,
            expectedDate: addDays(orderDate, between(3, 21)),
            reference: `PO-REF-${index + 1}`,
            notes: null,
            lines: range(between(1, 4)).map(() => {
              // Only inventory-tracked goods. Buying 17 units of "Delivery"
              // charged the P&L for something that could never be sold on,
              // which is what flattened the margin to 1%.
              const product = pick(stockableProducts.length > 0 ? stockableProducts : products);
              // Tuned against what the sales phase actually draws.
              //
              // Periodic inventory charges a purchase to expense the moment it
              // is made, so every unsold unit is a direct hit to profit. Buying
              // 8-20 left half the stock unsold and turned a 1.8x markup into a
              // 4% loss. This buys roughly 15% more than the year sells.
              const quantity = between(5, 13);
              bought.push({ productId: product.id, quantity, day: orderDay });

              return {
                productId: product.id,
                description: product.name,
                quantity: String(quantity),
                unitPrice: product.cost.toString(),
                taxId: purchaseTaxes.length > 0 && random() > 0.35 ? pick(purchaseTaxes).id : null,
                analyticAccountId: random() > 0.4 ? pick(expenseAnalytics).id : null,
              };
            }),
          },
          context,
        ),
      );

      purchaseOrderIds.push(order.id);
      purchasedByOrder.set(order.id, bought);
    },
  );

  const toBill = purchaseOrderIds.slice(0, COUNTS.purchaseOrders);
  const purchaseToCancel = purchaseOrderIds.slice(
    COUNTS.purchaseOrders + extraDraft(COUNTS.purchaseOrders),
  );

  await forEachWithProgress("Confirm purchase orders", toBill, async (id) => {
    await prisma.$transaction((tx) => confirmPurchaseOrder(tx, id, context));
  });

  await forEachWithProgress("Cancel purchase orders", purchaseToCancel, async (id) => {
    await prisma.$transaction((tx) => cancelPurchaseOrder(tx, id, context));
  });

  const billIds: string[] = [];

  await forEachWithProgress("Vendor bills", toBill, async (orderId) => {
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderDate: true },
    });

    const invoiceDate = addDays(order.orderDate, between(1, 10));

    const bill = await prisma.$transaction((tx) =>
      createBillFromPurchaseOrder(
        tx,
        {
          purchaseOrderId: orderId,
          journalId: purchaseJournal.id,
          invoiceDate,
          dueDate: addDays(invoiceDate, pick([15, 30, 30, 45])),
          vendorReference: `VB-${between(10000, 99999)}`,
        },
        context,
      ),
    );

    billIds.push(bill.id);
  });

  await forEachWithProgress("Post vendor bills", billIds, async (id) => {
    await prisma.$transaction((tx) => postVendorBill(tx, id, context));
  });

  /**
   * What is actually on the shelf, and from which day.
   *
   * Built from the billed orders only, because posting a bill is what records
   * the receipt. The sales phase below sells out of this and nothing else --
   * previously it picked any product at random, which is how the stock report
   * ended up showing 16 units sold of something that was never bought.
   *
   * Only inventory-tracked products need this. A service, or a product with
   * tracking switched off, records no stock movement and can be sold freely.
   */
  const onHand = new Map<string, { day: number; quantity: number }[]>();

  for (const orderId of toBill) {
    for (const line of purchasedByOrder.get(orderId) ?? []) {
      if (!trackedProductIds.has(line.productId)) continue;

      const tranches = onHand.get(line.productId) ?? [];
      tranches.push({ day: line.day, quantity: line.quantity });
      onHand.set(line.productId, tranches);
    }
  }

  // Oldest first, so stock is drawn down FIFO.
  for (const tranches of onHand.values()) tranches.sort((a, b) => a.day - b.day);

  const sellableUntracked = products.filter((product) => !trackedProductIds.has(product.id));
  const productsById = new Map(products.map((product) => [product.id, product]));

  // -------------------------------------------------------------------------
  // 9. Sales: orders -> invoices -> receipts
  // -------------------------------------------------------------------------
  const salesOrderIds: string[] = [];

  await forEachWithProgress(
    "Sales orders",
    range(COUNTS.salesOrders + extraDraft(COUNTS.salesOrders) + extraCancelled(COUNTS.salesOrders)),
    async (index) => {
      // Selling starts a fortnight in, once the first receipts have landed.
      const orderDay = between(14, FY_DAYS);
      const orderDate = fyDate(orderDay);

      /**
       * One line, drawn from stock that exists on this date.
       *
       * A tracked product can only be sold if it has been received by
       * `orderDay` and has units left; the quantity is capped at what is on
       * hand and deducted, so cumulative sales can never exceed cumulative
       * purchases. When nothing tracked is available the line falls back to a
       * service or an untracked product, which carries no stock at all.
       */
      function buildLine() {
        /**
         * Units of `productId` that have physically arrived by `orderDay`.
         *
         * Counted per delivery, not as one lump. Treating a product's whole
         * quantity as available from its FIRST delivery let a sale draw on a
         * tranche that had not landed yet: the year balanced, but the stock
         * report went negative inside any shorter window.
         *
         * The 12-day gap covers the bill posting up to 10 days after the
         * purchase order versus this sale's invoice posting up to 7 days after
         * the sales order, so the receipt is always dated before the delivery.
         */
        const arrivedBy = (tranches: { day: number; quantity: number }[]) =>
          tranches.reduce(
            (total, tranche) => (tranche.day + 12 <= orderDay ? total + tranche.quantity : total),
            0,
          );

        const available = [...onHand.entries()].filter(([, t]) => arrivedBy(t) > 0);

        if (available.length === 0) {
          const product = pick(sellableUntracked.length > 0 ? sellableUntracked : products);
          return {
            productId: product.id,
            description: product.name,
            quantity: String(between(1, 6)),
            unitPrice: product.salesPrice.toString(),
          };
        }

        const [productId, tranches] = pick(available);
        const product = productsById.get(productId)!;
        // Never the last unit: leaving a floor is what produces believable
        // closing stock instead of every product finishing the year at zero.
        const sellable = Math.floor(arrivedBy(tranches) * 0.85);
        if (sellable < 1) {
          const fallback = pick(sellableUntracked.length > 0 ? sellableUntracked : products);
          return {
            productId: fallback.id,
            description: fallback.name,
            quantity: String(between(1, 6)),
            unitPrice: fallback.salesPrice.toString(),
          };
        }

        let quantity = between(1, Math.min(sellable, 12));
        const sold = quantity;

        // Draw down oldest-first.
        for (const tranche of tranches) {
          if (quantity <= 0) break;
          if (tranche.day + 12 > orderDay) continue;

          const taken = Math.min(tranche.quantity, quantity);
          tranche.quantity -= taken;
          quantity -= taken;
        }

        return {
          productId: product.id,
          description: product.name,
          quantity: String(sold),
          unitPrice: product.salesPrice.toString(),
        };
      }

      const order = await prisma.$transaction((tx) =>
        createSalesOrder(
          tx,
          {
            customerId: pick(customers).id,
            orderDate,
            reference: `SO-REF-${index + 1}`,
            notes: null,
            lines: range(between(1, 4)).map(() => ({
              ...buildLine(),
              taxId: salesTaxes.length > 0 && random() > 0.35 ? pick(salesTaxes).id : null,
              analyticAccountId: random() > 0.4 ? pick(incomeAnalytics).id : null,
            })),
          },
          context,
        ),
      );

      salesOrderIds.push(order.id);
    },
  );

  // The first N are confirmed and invoiced; the rest stay draft or get
  // cancelled, so the status filters on the list have something to find.
  const toInvoice = salesOrderIds.slice(0, COUNTS.salesOrders);
  const toCancel = salesOrderIds.slice(COUNTS.salesOrders + extraDraft(COUNTS.salesOrders));

  await forEachWithProgress("Confirm sales orders", toInvoice, async (id) => {
    await prisma.$transaction((tx) => confirmSalesOrder(tx, id, context));
  });

  await forEachWithProgress("Cancel sales orders", toCancel, async (id) => {
    await prisma.$transaction((tx) => cancelSalesOrder(tx, id, context));
  });

  const invoiceIds: string[] = [];

  await forEachWithProgress("Customer invoices", toInvoice, async (orderId) => {
    const order = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderDate: true },
    });

    const invoiceDate = addDays(order.orderDate, between(0, 7));

    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(
        tx,
        {
          salesOrderId: orderId,
          journalId: salesJournal.id,
          invoiceDate,
          dueDate: addDays(invoiceDate, pick([15, 30, 30, 45, 60])),
          reference: null,
        },
        context,
      ),
    );

    invoiceIds.push(invoice.id);
  });

  await forEachWithProgress("Post customer invoices", invoiceIds, async (id) => {
    await prisma.$transaction((tx) => postCustomerInvoice(tx, id, context));
  });

  // -------------------------------------------------------------------------
  // 10. Payments
  // -------------------------------------------------------------------------
  // Roughly a third settled in full, a third part-paid, a third left open --
  // which is what makes the ageing report and the outstanding lists worth
  // looking at.
  await forEachWithProgress(
    "Customer receipts",
    invoiceIds.slice(0, Math.round(COUNTS.salesOrders * 0.62)),
    async (id, index) => {
      const invoice = await prisma.customerInvoice.findUniqueOrThrow({
        where: { id },
        select: { customerId: true, amountResidual: true, invoiceDate: true, status: true },
      });

      const residual = Number(invoice.amountResidual);
      if (residual <= 0) return;

      // Every other one is a part payment.
      const full = index % 2 === 0;
      const amount = full ? residual : Math.max(Math.round(residual * 0.4), 1);

      await prisma.$transaction((tx) =>
        registerPayment(
          tx,
          {
            direction: PaymentDirection.INBOUND,
            contactId: invoice.customerId,
            journalId: pick(paymentJournals).id,
            paymentDate: addDays(invoice.invoiceDate, between(1, 40)),
            amount: amount.toFixed(2),
            reference: `RCPT-${between(100000, 999999)}`,
            note: null,
            allocations: [{ documentId: id, amount: amount.toFixed(2) }],
          },
          context,
        ),
      );
    },
  );

  await forEachWithProgress(
    "Vendor payments",
    billIds.slice(0, Math.round(COUNTS.purchaseOrders * 0.62)),
    async (id, index) => {
      const bill = await prisma.vendorBill.findUniqueOrThrow({
        where: { id },
        select: { vendorId: true, amountResidual: true, invoiceDate: true },
      });

      const residual = Number(bill.amountResidual);
      if (residual <= 0) return;

      const full = index % 2 === 0;
      const amount = full ? residual : Math.max(Math.round(residual * 0.5), 1);

      await prisma.$transaction((tx) =>
        registerPayment(
          tx,
          {
            direction: PaymentDirection.OUTBOUND,
            contactId: bill.vendorId,
            journalId: pick(paymentJournals).id,
            paymentDate: addDays(bill.invoiceDate, between(1, 35)),
            amount: amount.toFixed(2),
            reference: `PAY-${between(100000, 999999)}`,
            note: null,
            allocations: [{ documentId: id, amount: amount.toFixed(2) }],
          },
          context,
        ),
      );
    },
  );

  // -------------------------------------------------------------------------
  // 11. Manual journal entries
  // -------------------------------------------------------------------------
  // Two lines, equal and opposite, posted through the engine — so they are
  // balanced by construction and the deferred constraint trigger verifies it
  // again at COMMIT.
  await forEachWithProgress("Journal entries", range(COUNTS.journalEntries), async (index) => {
    const amount = money(500, 60000, 50);

    // Both sides are balance-sheet accounts, so these are transfers and
    // reclassifications rather than trading activity.
    //
    // The previous version debited an expense account every time, quietly
    // adding several million to the P&L and turning a profitable set of
    // documents into a loss. An "adjustment" that always costs money is not an
    // adjustment.
    const [debit, credit] = pickDistinct(balanceSheetAccounts, 2);
    if (!debit || !credit) return;

    await prisma.$transaction((tx) =>
      postJournalEntry(
        tx,
        {
          journalId: generalJournal.id,
          date: fyDate(between(0, FY_DAYS)),
          reference: `DEMO-JE-${index + 1}`,
          description: `DEMO adjustment ${index + 1} — ${pick(PROJECTS)}`,
          lines: [
            { accountId: debit.id, debit: amount, description: "Demo debit" },
            { accountId: credit.id, credit: amount, description: "Demo credit" },
          ],
        },
        context,
      ),
    );
  });

  // -------------------------------------------------------------------------
  // 12. Budgets
  // -------------------------------------------------------------------------
  await forEachWithProgress("Budgets", range(COUNTS.budgets), async (index) => {
    const quarter = index % 4;
    const periodStart = fyDate(quarter * 90);
    const periodEnd = addDays(periodStart, 89);

    const budget = await prisma.$transaction((tx) =>
      createBudget(
        tx,
        {
          name: `DEMO ${pick(PROJECTS)} Budget ${index + 1}`,
          periodStart,
          periodEnd,
          responsibleUserId: admin.id,
          // A budget may name an analytic account only once, so the lines are
          // drawn without replacement rather than picked independently.
          lines: pickDistinct(analyticAccounts, between(2, 5)).map((analytic) => ({
            analyticAccountId: analytic.id,
            accountId: random() > 0.5 ? pick(incomeAccounts).id : null,
            plannedAmount: money(200000, 2500000, 10000),
          })),
        },
        context,
      ),
    );

    // A spread of statuses so the filters and the pie charts have variety.
    // Confirming also recomputes committed and achieved from the real ledger.
    const roll = random();
    if (roll > 0.35) {
      await prisma.$transaction((tx) => confirmBudget(tx, budget.id, context));
    } else if (roll > 0.2) {
      await prisma.$transaction((tx) => cancelBudget(tx, budget.id, context));
    }
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const counts = {
    contacts: await prisma.contact.count(),
    products: await prisma.product.count(),
    "chart of accounts": await prisma.ledgerAccount.count(),
    journals: await prisma.journal.count(),
    "analytic accounts": await prisma.analyticAccount.count(),
    users: await prisma.user.count(),
    "sales orders": await prisma.salesOrder.count(),
    "customer invoices": await prisma.customerInvoice.count(),
    "purchase orders": await prisma.purchaseOrder.count(),
    "vendor bills": await prisma.vendorBill.count(),
    payments: await prisma.payment.count(),
    "journal entries": await prisma.journalEntry.count(),
    "journal items": await prisma.journalItem.count(),
    budgets: await prisma.budget.count(),
    "stock moves": await prisma.stockMove.count(),
  };

  console.log("\nRow counts:");
  for (const [label, count] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(20)} ${count}`);
  }

  // The point of going through the services: the books still balance.
  const totals = await prisma.journalItem.aggregate({ _sum: { debit: true, credit: true } });
  const debit = Number(totals._sum.debit ?? 0);
  const credit = Number(totals._sum.credit ?? 0);

  console.log(
    `\nLedger check: debits ${debit.toFixed(2)} vs credits ${credit.toFixed(2)} — ` +
      (Math.abs(debit - credit) < 0.005 ? "balanced." : "OUT OF BALANCE."),
  );

  console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  console.log("Demo logins: demo0000 … / ChangeMe!123\n");
}

main()
  .catch((error) => {
    console.error("\nDemo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
