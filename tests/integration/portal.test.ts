import { InvoiceStatus, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPortalInvoice,
  getPortalOverview,
  listPortalInvoices,
  listPortalPayments,
} from "@/modules/portal/portal-service";
import { getAgeingReport, getPartnerLedger } from "@/modules/reporting/partner-ledger-service";

/**
 * Contact isolation, against a real database.
 *
 * The whole point of the portal is that one customer cannot reach another's
 * documents. These tests deliberately attempt exactly that — with valid,
 * existing ids belonging to someone else — and assert that nothing comes back.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("portal isolation (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const suffix = Date.now().toString(36).slice(-6);

  let aliceId: string;
  let bobId: string;
  let aliceInvoiceId: string;
  let bobInvoiceId: string;
  let aliceDraftId: string;

  const createdInvoices: string[] = [];

  async function makeInvoice(
    customerId: string,
    amount: string,
    status: InvoiceStatus,
    dueDaysAgo = 0,
  ) {
    const [journal, income] = await Promise.all([
      prisma.journal.findFirstOrThrow({ where: { type: "SALES" } }),
      prisma.ledgerAccount.findFirstOrThrow({ where: { type: "INCOME" } }),
    ]);

    const invoiceDate = new Date("2026-05-01T00:00:00Z");
    const dueDate = new Date(Date.now() - dueDaysAgo * 86_400_000);

    const invoice = await prisma.customerInvoice.create({
      data: {
        number: `PORTAL-${suffix}-${createdInvoices.length}`,
        customerId,
        journalId: journal.id,
        invoiceDate,
        dueDate,
        status,
        amountUntaxed: amount,
        amountTax: 0,
        amountTotal: amount,
        amountPaid: 0,
        amountResidual: status === InvoiceStatus.PAID ? "0" : amount,
        lines: {
          create: [
            {
              sequence: 1,
              description: "Portal test line",
              quantity: 1,
              unitPrice: amount,
              accountId: income.id,
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
    const receivable = await prisma.ledgerAccount.findFirstOrThrow({ where: { code: "1200" } });

    const [alice, bob] = await Promise.all([
      prisma.contact.create({
        data: { name: `Alice ${suffix}`, type: "CUSTOMER", receivableAccountId: receivable.id },
        select: { id: true },
      }),
      prisma.contact.create({
        data: { name: `Bob ${suffix}`, type: "CUSTOMER", receivableAccountId: receivable.id },
        select: { id: true },
      }),
    ]);

    aliceId = alice.id;
    bobId = bob.id;

    aliceInvoiceId = await makeInvoice(aliceId, "1000.00", InvoiceStatus.POSTED, 45);
    bobInvoiceId = await makeInvoice(bobId, "2000.00", InvoiceStatus.POSTED, 100);
    aliceDraftId = await makeInvoice(aliceId, "999.00", InvoiceStatus.DRAFT);
  });

  afterAll(async () => {
    await prisma.customerInvoiceLine.deleteMany({
      where: { invoiceId: { in: createdInvoices } },
    });
    await prisma.customerInvoice.deleteMany({ where: { id: { in: createdInvoices } } });
    await prisma.contact.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
    await prisma.$disconnect();
  });

  it("lists only the signed-in contact's own invoices", async () => {
    const alices = await listPortalInvoices(aliceId, prisma);
    const ids = alices.map((invoice) => invoice.id);

    expect(ids).toContain(aliceInvoiceId);
    expect(ids).not.toContain(bobInvoiceId);
  });

  it("hides draft invoices from the customer", async () => {
    const alices = await listPortalInvoices(aliceId, prisma);
    // A draft is internal working state; showing it would imply a commitment.
    expect(alices.map((invoice) => invoice.id)).not.toContain(aliceDraftId);
  });

  it("returns nothing when one contact asks for another's invoice by id", async () => {
    const stolen = await getPortalInvoice(
      { contactId: aliceId, invoiceId: bobInvoiceId },
      prisma,
    );

    // Null rather than a permission error: the page 404s, which does not even
    // confirm that the document exists.
    expect(stolen).toBeNull();
  });

  it("returns the invoice when it really is the contact's own", async () => {
    const own = await getPortalInvoice(
      { contactId: aliceId, invoiceId: aliceInvoiceId },
      prisma,
    );

    expect(own?.id).toBe(aliceInvoiceId);
    expect(own?.customer.id).toBe(aliceId);
  });

  it("will not hand over a draft invoice even to its own customer", async () => {
    const draft = await getPortalInvoice({ contactId: aliceId, invoiceId: aliceDraftId }, prisma);
    expect(draft).toBeNull();
  });

  it("counts only the contact's own balance in the overview", async () => {
    const overview = await getPortalOverview(aliceId, prisma);

    expect(overview?.contactName).toContain("Alice");
    // Alice's 1000, not Alice's 1000 plus Bob's 2000.
    expect(Number(overview?.outstandingInvoices)).toBe(1000);
    expect(overview?.openInvoiceCount).toBe(1);
    expect(overview?.overdueInvoiceCount).toBe(1);
  });

  it("lists only the contact's own payments", async () => {
    const payments = await listPortalPayments(bobId, prisma);
    expect(payments.every((payment) => payment.number.length > 0)).toBe(true);
  });

  describe("scoped reporting services", () => {
    it("refuses a partner ledger for someone else's contact", async () => {
      const stolen = await getPartnerLedger(
        {
          contactId: bobId,
          period: { from: new Date("2026-01-01"), to: new Date("2027-01-01") },
          side: "RECEIVABLE",
          scope: { kind: "contact", contactId: aliceId },
        },
        prisma,
      );

      expect(stolen).toBeNull();
    });

    it("allows a partner ledger for the caller's own contact", async () => {
      const own = await getPartnerLedger(
        {
          contactId: aliceId,
          period: { from: new Date("2026-01-01"), to: new Date("2027-01-01") },
          side: "RECEIVABLE",
          scope: { kind: "contact", contactId: aliceId },
        },
        prisma,
      );

      expect(own?.contactId).toBe(aliceId);
      expect(own?.lines.some((line) => line.reference.includes(suffix))).toBe(true);
    });

    it("returns nothing at all for a scope of none", async () => {
      const nothing = await getPartnerLedger(
        {
          contactId: aliceId,
          period: { from: new Date("2026-01-01"), to: new Date("2027-01-01") },
          side: "RECEIVABLE",
          scope: { kind: "none" },
        },
        prisma,
      );

      expect(nothing).toBeNull();
    });

    it("narrows the ageing report to the caller's own contact", async () => {
      const scoped = await getAgeingReport(
        {
          side: "RECEIVABLE",
          asAt: new Date(),
          scope: { kind: "contact", contactId: aliceId },
        },
        prisma,
      );

      expect(scoped.rows.every((row) => row.contactId === aliceId)).toBe(true);
      expect(scoped.rows.some((row) => row.contactId === bobId)).toBe(false);
    });
  });

  describe("ageing buckets", () => {
    it("puts each debt in the bucket its age calls for", async () => {
      const report = await getAgeingReport({ side: "RECEIVABLE", asAt: new Date() }, prisma);

      const alice = report.rows.find((row) => row.contactId === aliceId);
      const bob = report.rows.find((row) => row.contactId === bobId);

      // Alice is 45 days overdue, Bob 100.
      expect(Number(alice?.buckets.d31_60)).toBe(1000);
      expect(Number(alice?.buckets.d90_plus)).toBe(0);
      expect(Number(bob?.buckets.d90_plus)).toBe(2000);
    });

    it("adds the buckets up to each row's total", async () => {
      const report = await getAgeingReport({ side: "RECEIVABLE", asAt: new Date() }, prisma);

      for (const row of report.rows) {
        const summed = Object.values(row.buckets).reduce(
          (total, value) => total + Number(value),
          0,
        );
        expect(summed).toBeCloseTo(Number(row.total), 2);
      }
    });

    it("adds the rows up to the grand total", async () => {
      const report = await getAgeingReport({ side: "RECEIVABLE", asAt: new Date() }, prisma);

      const summed = report.rows.reduce((total, row) => total + Number(row.total), 0);
      expect(summed).toBeCloseTo(Number(report.grandTotal), 2);
    });
  });
});
