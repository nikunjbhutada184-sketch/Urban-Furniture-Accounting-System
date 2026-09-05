import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { receiveCustomerInvoicePayment } from "@/modules/payments/customer-payment-service";
import {
  createInvoiceFromSalesOrder,
  postCustomerInvoice,
} from "@/modules/sales/customer-invoice-service";
import { confirmSalesOrder, createSalesOrder } from "@/modules/sales/sales-order-service";
import { getTrialBalance } from "@/server/accounting/ledger-service";
import { ConflictError, OverAllocationError } from "@/server/errors";

/**
 * The specification's sales walkthrough, end to end against PostgreSQL.
 *
 * Sales Order -> Customer Invoice -> Payment -> Journal Entry -> Ledger,
 * plus the stock move for goods. Nothing is mocked: this is the real posting
 * engine writing to a real database with all constraints and triggers live.
 *
 * Requires TEST_DATABASE_URL, migrated and seeded.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("sales workflow (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  let customerId: string;
  let productId: string;
  let salesJournalId: string;
  let bankJournalId: string;
  let cashJournalId: string;
  let gst18Id: string;
  let debtorsId: string;

  beforeAll(async () => {
    const [customer, product, salesJournal, bankJournal, cashJournal, gst18, debtors] =
      await Promise.all([
        prisma.contact.findFirstOrThrow({ where: { name: "Nimesh Pathak" } }),
        prisma.product.findUniqueOrThrow({ where: { sku: "UF-CHAIR-001" } }),
        prisma.journal.findUniqueOrThrow({ where: { code: "SAL" } }),
        prisma.journal.findUniqueOrThrow({ where: { code: "BNK" } }),
        prisma.journal.findUniqueOrThrow({ where: { code: "CSH" } }),
        prisma.tax.findUniqueOrThrow({ where: { name: "GST 18%" } }),
        prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "1100" } }),
      ]);

    customerId = customer.id;
    productId = product.id;
    salesJournalId = salesJournal.id;
    bankJournalId = bankJournal.id;
    cashJournalId = cashJournal.id;
    gst18Id = gst18.id;
    debtorsId = debtors.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates and confirms an order for `quantity` Office Chairs at 4500. */
  async function confirmedOrder(quantity = "5") {
    const order = await prisma.$transaction((tx) =>
      createSalesOrder(tx, {
        customerId,
        orderDate: new Date("2026-04-15T00:00:00Z"),
        reference: null,
        notes: null,
        lines: [
          {
            productId,
            description: "Office Chair",
            quantity,
            unitPrice: "4500.0000",
            taxId: gst18Id,
            analyticAccountId: null,
          },
        ],
      }),
    );

    return prisma.$transaction((tx) => confirmSalesOrder(tx, order.id));
  }

  it("computes order totals as exact decimals", async () => {
    const order = await confirmedOrder();

    expect(order.amountUntaxed.toFixed(2)).toBe("22500.00");
    expect(order.amountTax.toFixed(2)).toBe("4050.00");
    expect(order.amountTotal.toFixed(2)).toBe("26550.00");
    expect(order.status).toBe("CONFIRMED");
  });

  it("generates an invoice, posts it, and receives payment in full", async () => {
    const order = await confirmedOrder();

    // --- generate the invoice ------------------------------------------------
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: new Date("2026-05-16T00:00:00Z"),
        reference: null,
      }),
    );

    expect(invoice.status).toBe("DRAFT");
    expect(invoice.amountTotal.toFixed(2)).toBe("26550.00");

    // The order is now closed to further invoicing.
    const reloadedOrder = await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloadedOrder.status).toBe("INVOICED");

    // --- post it -------------------------------------------------------------
    const posted = await prisma.$transaction((tx) => postCustomerInvoice(tx, invoice.id));

    expect(posted.status).toBe("POSTED");
    expect(posted.journalEntryId).not.toBeNull();
    expect(posted.amountResidual.toFixed(2)).toBe("26550.00");

    // The journal entry balances: Dr Debtors 26550 / Cr Income 22500 + Cr Tax 4050.
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: posted.journalEntryId! },
      include: { items: { include: { account: true }, orderBy: { sequence: "asc" } } },
    });

    expect(entry.status).toBe("POSTED");
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
    expect(entry.totalDebit.toFixed(2)).toBe("26550.00");

    const debtorLine = entry.items.find((item) => item.account.code === "1100");
    const incomeLine = entry.items.find((item) => item.account.code === "4100");
    const taxLine = entry.items.find((item) => item.account.code === "2200");

    expect(debtorLine?.debit.toFixed(2)).toBe("26550.00");
    expect(incomeLine?.credit.toFixed(2)).toBe("22500.00");
    expect(taxLine?.credit.toFixed(2)).toBe("4050.00");

    // Stock left the building for this tracked product.
    const moves = await prisma.stockMove.findMany({
      where: { sourceType: "CustomerInvoice", sourceId: invoice.id },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0]?.direction).toBe("OUT");
    expect(moves[0]?.quantity.toFixed(3)).toBe("5.000");

    // --- receive the payment through the bank --------------------------------
    await prisma.$transaction((tx) =>
      receiveCustomerInvoicePayment(tx, {
        invoiceId: invoice.id,
        journalId: bankJournalId,
        method: "BANK",
        paymentDate: new Date("2026-04-20T00:00:00Z"),
        amount: "26550.00",
        reference: "UTR-123456",
      }),
    );

    const settled = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice.id } });

    expect(settled.status).toBe("PAID");
    expect(settled.amountPaid.toFixed(2)).toBe("26550.00");
    expect(settled.amountResidual.toFixed(2)).toBe("0.00");
  });

  it("supports a partial payment, then settles the remainder", async () => {
    const order = await confirmedOrder("2");
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: null,
        reference: null,
      }),
    );
    await prisma.$transaction((tx) => postCustomerInvoice(tx, invoice.id));

    // 2 x 4500 + 18% = 10620
    await prisma.$transaction((tx) =>
      receiveCustomerInvoicePayment(tx, {
        invoiceId: invoice.id,
        journalId: cashJournalId,
        method: "CASH",
        paymentDate: new Date("2026-04-18T00:00:00Z"),
        amount: "5000.00",
        reference: null,
      }),
    );

    let current = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(current.status).toBe("PARTIALLY_PAID");
    expect(current.amountResidual.toFixed(2)).toBe("5620.00");

    await prisma.$transaction((tx) =>
      receiveCustomerInvoicePayment(tx, {
        invoiceId: invoice.id,
        journalId: cashJournalId,
        method: "CASH",
        paymentDate: new Date("2026-04-19T00:00:00Z"),
        amount: "5620.00",
        reference: null,
      }),
    );

    current = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(current.status).toBe("PAID");
    expect(current.amountResidual.toFixed(2)).toBe("0.00");
  });

  it("refuses a payment larger than the outstanding balance", async () => {
    const order = await confirmedOrder("1");
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: null,
        reference: null,
      }),
    );
    await prisma.$transaction((tx) => postCustomerInvoice(tx, invoice.id));

    // The invoice is 5310.00; try to pay more.
    await expect(
      prisma.$transaction((tx) =>
        receiveCustomerInvoicePayment(tx, {
          invoiceId: invoice.id,
          journalId: bankJournalId,
          method: "BANK",
          paymentDate: new Date("2026-04-20T00:00:00Z"),
          amount: "9999.00",
          reference: null,
        }),
      ),
    ).rejects.toThrow(OverAllocationError);

    // Nothing changed.
    const unchanged = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(unchanged.amountPaid.toFixed(2)).toBe("0.00");
    expect(unchanged.status).toBe("POSTED");
  });

  it("refuses a duplicate invoice for the same sales order", async () => {
    const order = await confirmedOrder("1");

    await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: null,
        reference: null,
      }),
    );

    await expect(
      prisma.$transaction((tx) =>
        createInvoiceFromSalesOrder(tx, {
          salesOrderId: order.id,
          journalId: salesJournalId,
          invoiceDate: new Date("2026-04-17T00:00:00Z"),
          dueDate: null,
          reference: null,
        }),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to pay a draft invoice", async () => {
    const order = await confirmedOrder("1");
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: null,
        reference: null,
      }),
    );

    await expect(
      prisma.$transaction((tx) =>
        receiveCustomerInvoicePayment(tx, {
          invoiceId: invoice.id,
          journalId: bankJournalId,
          method: "BANK",
          paymentDate: new Date("2026-04-20T00:00:00Z"),
          amount: "100.00",
          reference: null,
        }),
      ),
    ).rejects.toThrow(/has not been posted/);
  });

  it("refuses to post the same invoice twice", async () => {
    const order = await confirmedOrder("1");
    const invoice = await prisma.$transaction((tx) =>
      createInvoiceFromSalesOrder(tx, {
        salesOrderId: order.id,
        journalId: salesJournalId,
        invoiceDate: new Date("2026-04-16T00:00:00Z"),
        dueDate: null,
        reference: null,
      }),
    );

    await prisma.$transaction((tx) => postCustomerInvoice(tx, invoice.id));

    await expect(
      prisma.$transaction((tx) => postCustomerInvoice(tx, invoice.id)),
    ).rejects.toThrow();
  });

  it("refuses a vendor as a customer", async () => {
    const vendor = await prisma.contact.findFirstOrThrow({ where: { name: "Azure Furniture" } });

    await expect(
      prisma.$transaction((tx) =>
        createSalesOrder(tx, {
          customerId: vendor.id,
          orderDate: new Date("2026-04-15T00:00:00Z"),
          reference: null,
          notes: null,
          lines: [
            {
              productId,
              description: "Office Chair",
              quantity: "1",
              unitPrice: "4500.0000",
              taxId: null,
              analyticAccountId: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow(/not a customer/);
  });

  it("keeps the whole ledger balanced after every sale", async () => {
    const trialBalance = await getTrialBalance(prisma);

    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.difference.toFixed(2)).toBe("0.00");
  });

  it("leaves the customer's receivable consistent with their open invoices", async () => {
    const [ledger, invoices] = await Promise.all([
      prisma.journalItem.aggregate({
        where: { accountId: debtorsId, contactId: customerId, status: "POSTED" },
        _sum: { debit: true, credit: true },
      }),
      prisma.customerInvoice.findMany({
        where: { customerId, status: { in: ["POSTED", "PARTIALLY_PAID"] } },
        select: { amountResidual: true },
      }),
    ]);

    const ledgerBalance = (ledger._sum.debit ?? 0).toString();
    const documentOutstanding = invoices.reduce(
      (total, invoice) => total + Number(invoice.amountResidual),
      0,
    );

    const signedLedger =
      Number(ledgerBalance) - Number((ledger._sum.credit ?? 0).toString());

    // The ledger's receivable balance equals the sum of unpaid invoices.
    expect(signedLedger.toFixed(2)).toBe(documentOutstanding.toFixed(2));
  });
});
