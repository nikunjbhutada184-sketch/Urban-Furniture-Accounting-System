import { InvoiceStatus, PaymentDirection, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listOpenDocuments, registerPayment } from "@/modules/payments/payment-registration";
import { OverAllocationError, ValidationError } from "@/server/errors";

/**
 * Standalone payments: one receipt clearing several invoices.
 *
 * The single-document flow is covered by `sales-flow`; what matters here is the
 * multi-document case — that the allocation is checked against each invoice's
 * live residual, that a remainder is held as an advance, and that a forged id
 * cannot reach another contact's invoice.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("payment allocation (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const suffix = Date.now().toString(36).slice(-6);

  let customerId: string;
  let otherCustomerId: string;
  let bankJournalId: string;
  let salesJournalId: string;
  let incomeAccountId: string;
  let receivableAccountId: string;

  const createdInvoices: string[] = [];
  const createdPayments: string[] = [];

  /** A posted invoice for `contactId`, of `amount`, ready to be settled. */
  async function postInvoice(contactId: string, amount: string, dueDays = 30) {
    const invoiceDate = new Date("2026-06-01T00:00:00Z");
    const dueDate = new Date(invoiceDate.getTime() + dueDays * 86_400_000);

    const invoice = await prisma.customerInvoice.create({
      data: {
        number: `TEST-INV-${suffix}-${createdInvoices.length}`,
        customerId: contactId,
        journalId: salesJournalId,
        invoiceDate,
        dueDate,
        status: InvoiceStatus.POSTED,
        amountUntaxed: amount,
        amountTax: 0,
        amountTotal: amount,
        amountPaid: 0,
        amountResidual: amount,
        lines: {
          create: [
            {
              sequence: 1,
              description: "Test line",
              quantity: 1,
              unitPrice: amount,
              accountId: incomeAccountId,
              taxAmount: 0,
              subtotal: amount,
              total: amount,
            },
          ],
        },
      },
      select: { id: true },
    });

    createdInvoices.push(invoice.id);
    return invoice.id;
  }

  beforeAll(async () => {
    const [bank, sales, income, receivable] = await Promise.all([
      prisma.journal.findFirstOrThrow({
        where: { type: "BANK", paymentAccountId: { not: null } },
      }),
      prisma.journal.findFirstOrThrow({ where: { type: "SALES" } }),
      prisma.ledgerAccount.findFirstOrThrow({ where: { type: "INCOME" } }),
      prisma.ledgerAccount.findFirstOrThrow({ where: { code: "1200" } }),
    ]);

    bankJournalId = bank.id;
    salesJournalId = sales.id;
    incomeAccountId = income.id;
    receivableAccountId = receivable.id;

    const [customer, other] = await Promise.all([
      prisma.contact.create({
        data: { name: `Alloc Customer ${suffix}`, type: "CUSTOMER", receivableAccountId },
        select: { id: true },
      }),
      prisma.contact.create({
        data: { name: `Other Customer ${suffix}`, type: "CUSTOMER", receivableAccountId },
        select: { id: true },
      }),
    ]);

    customerId = customer.id;
    otherCustomerId = other.id;
  });

  afterAll(async () => {
    await prisma.paymentAllocation.deleteMany({
      where: { OR: [{ paymentId: { in: createdPayments } }, { customerInvoiceId: { in: createdInvoices } }] },
    });
    await prisma.customerInvoiceLine.deleteMany({
      where: { invoiceId: { in: createdInvoices } },
    });
    await prisma.customerInvoice.deleteMany({ where: { id: { in: createdInvoices } } });

    const payments = await prisma.payment.findMany({
      where: { id: { in: createdPayments } },
      select: { journalEntryId: true },
    });
    await prisma.payment.deleteMany({ where: { id: { in: createdPayments } } });

    const entryIds = payments
      .map((payment) => payment.journalEntryId)
      .filter((id): id is string => id !== null);

    // Posted entries are immutable by trigger, so the ledger rows created by
    // these tests are left in place deliberately; only the documents are
    // cleaned up.
    if (entryIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: entryIds } } });
    }

    await prisma.contact.updateMany({
      where: { id: { in: [customerId, otherCustomerId] } },
      data: { isArchived: true },
    });
    await prisma.$disconnect();
  });

  it("lists only the contact's own open documents", async () => {
    const mine = await postInvoice(customerId, "1000.00");
    await postInvoice(otherCustomerId, "500.00");

    const open = await listOpenDocuments(
      { contactId: customerId, direction: PaymentDirection.INBOUND },
      prisma,
    );

    expect(open.map((document) => document.id)).toContain(mine);
    expect(open.every((document) => document.id !== undefined)).toBe(true);
    // The other customer's invoice is absent, not merely unselected.
    const otherOpen = await listOpenDocuments(
      { contactId: otherCustomerId, direction: PaymentDirection.INBOUND },
      prisma,
    );
    expect(otherOpen.some((document) => document.id === mine)).toBe(false);
  });

  it("settles several invoices with one receipt", async () => {
    const first = await postInvoice(customerId, "400.00");
    const second = await postInvoice(customerId, "600.00");

    const payment = await prisma.$transaction((tx) =>
      registerPayment(tx, {
        direction: PaymentDirection.INBOUND,
        contactId: customerId,
        journalId: bankJournalId,
        paymentDate: new Date("2026-06-10T00:00:00Z"),
        amount: "1000.00",
        reference: "MULTI-1",
        note: null,
        allocations: [
          { documentId: first, amount: "400.00" },
          { documentId: second, amount: "600.00" },
        ],
      }),
    );

    createdPayments.push(payment.id);

    const [a, b] = await Promise.all([
      prisma.customerInvoice.findUniqueOrThrow({ where: { id: first } }),
      prisma.customerInvoice.findUniqueOrThrow({ where: { id: second } }),
    ]);

    expect(a.status).toBe(InvoiceStatus.PAID);
    expect(b.status).toBe(InvoiceStatus.PAID);
    expect(a.amountResidual.toString()).toBe("0");
    expect(b.amountResidual.toString()).toBe("0");
    expect(payment.amountUnallocated.toString()).toBe("0");
  });

  it("holds an unallocated remainder as an advance", async () => {
    const invoice = await postInvoice(customerId, "300.00");

    const payment = await prisma.$transaction((tx) =>
      registerPayment(tx, {
        direction: PaymentDirection.INBOUND,
        contactId: customerId,
        journalId: bankJournalId,
        paymentDate: new Date("2026-06-11T00:00:00Z"),
        amount: "500.00",
        reference: null,
        note: null,
        allocations: [{ documentId: invoice, amount: "300.00" }],
      }),
    );

    createdPayments.push(payment.id);

    expect(payment.amount.toString()).toBe("500");
    expect(payment.amountUnallocated.toString()).toBe("200");

    // The ledger entry is for the full amount: the money moved, allocated or not.
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: payment.journalEntryId! },
      select: { items: { select: { debit: true, credit: true } } },
    });

    const debits = entry.items.reduce((sum, item) => sum + Number(item.debit), 0);
    const credits = entry.items.reduce((sum, item) => sum + Number(item.credit), 0);

    expect(debits).toBe(500);
    expect(credits).toBe(500);
  });

  it("partially settles an invoice", async () => {
    const invoice = await postInvoice(customerId, "800.00");

    const payment = await prisma.$transaction((tx) =>
      registerPayment(tx, {
        direction: PaymentDirection.INBOUND,
        contactId: customerId,
        journalId: bankJournalId,
        paymentDate: new Date("2026-06-12T00:00:00Z"),
        amount: "300.00",
        reference: null,
        note: null,
        allocations: [{ documentId: invoice, amount: "300.00" }],
      }),
    );

    createdPayments.push(payment.id);

    const updated = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice } });
    expect(updated.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(updated.amountResidual.toString()).toBe("500");
  });

  it("refuses to allocate more to an invoice than it owes", async () => {
    const invoice = await postInvoice(customerId, "100.00");

    await expect(
      prisma.$transaction((tx) =>
        registerPayment(tx, {
          direction: PaymentDirection.INBOUND,
          contactId: customerId,
          journalId: bankJournalId,
          paymentDate: new Date("2026-06-13T00:00:00Z"),
          amount: "500.00",
          reference: null,
          note: null,
          allocations: [{ documentId: invoice, amount: "500.00" }],
        }),
      ),
    ).rejects.toBeInstanceOf(OverAllocationError);

    // Nothing was written: the invoice is untouched.
    const untouched = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoice } });
    expect(untouched.status).toBe(InvoiceStatus.POSTED);
    expect(untouched.amountResidual.toString()).toBe("100");
  });

  it("refuses to allocate more than the payment itself", async () => {
    const first = await postInvoice(customerId, "400.00");
    const second = await postInvoice(customerId, "400.00");

    await expect(
      prisma.$transaction((tx) =>
        registerPayment(tx, {
          direction: PaymentDirection.INBOUND,
          contactId: customerId,
          journalId: bankJournalId,
          paymentDate: new Date("2026-06-14T00:00:00Z"),
          amount: "500.00",
          reference: null,
          note: null,
          allocations: [
            { documentId: first, amount: "400.00" },
            { documentId: second, amount: "400.00" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(OverAllocationError);
  });

  it("cannot settle another contact's invoice, even with a valid id", async () => {
    const theirs = await postInvoice(otherCustomerId, "250.00");

    await expect(
      prisma.$transaction((tx) =>
        registerPayment(tx, {
          direction: PaymentDirection.INBOUND,
          // The payment is from OUR customer...
          contactId: customerId,
          journalId: bankJournalId,
          paymentDate: new Date("2026-06-15T00:00:00Z"),
          amount: "250.00",
          reference: null,
          note: null,
          // ...but points at someone else's invoice.
          allocations: [{ documentId: theirs, amount: "250.00" }],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const untouched = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: theirs } });
    expect(untouched.amountResidual.toString()).toBe("250");
  });

  it("rolls the whole payment back when one allocation fails", async () => {
    const good = await postInvoice(customerId, "100.00");
    const theirs = await postInvoice(otherCustomerId, "100.00");

    const paymentsBefore = await prisma.payment.count();

    await expect(
      prisma.$transaction((tx) =>
        registerPayment(tx, {
          direction: PaymentDirection.INBOUND,
          contactId: customerId,
          journalId: bankJournalId,
          paymentDate: new Date("2026-06-16T00:00:00Z"),
          amount: "200.00",
          reference: null,
          note: null,
          allocations: [
            { documentId: good, amount: "100.00" },
            { documentId: theirs, amount: "100.00" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // No payment, and the valid invoice was not touched either.
    expect(await prisma.payment.count()).toBe(paymentsBefore);
    const untouched = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: good } });
    expect(untouched.amountResidual.toString()).toBe("100");
  });

  it("refuses the same document twice on one payment", async () => {
    const invoice = await postInvoice(customerId, "500.00");

    await expect(
      prisma.$transaction((tx) =>
        registerPayment(tx, {
          direction: PaymentDirection.INBOUND,
          contactId: customerId,
          journalId: bankJournalId,
          paymentDate: new Date("2026-06-17T00:00:00Z"),
          amount: "400.00",
          reference: null,
          note: null,
          allocations: [
            { documentId: invoice, amount: "200.00" },
            { documentId: invoice, amount: "200.00" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
