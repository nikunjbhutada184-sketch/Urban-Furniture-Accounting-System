# Demo script

Roughly 8–10 minutes if you show everything, 5 if you skip sections 6 and 7.

## Before you start

```bash
npm run dev
```

Open http://localhost:3000 and sign in as **`ufowner` / `ChangeMe!123`**.

If the data ever looks wrong, rebuild it:

```bash
npx prisma migrate reset --force && npm run db:demo
```

| Role | Login id | Password |
| ---- | -------- | -------- |
| Admin | `ufowner` | `ChangeMe!123` |
| Accountant | `ufaccounts` | `ChangeMe!123` |
| Customer portal | `nimeshp` | `ChangeMe!123` |

---

## The opening line (30 seconds)

> "This is a full accounting system for Urban Furniture, a furniture business.
>
> You can run the whole business through it — add customers and products, raise
> purchase orders, receive bills, send invoices, take payments, set budgets, and
> print your financial statements at the end of the year.
>
> The important part is what sits underneath. Everything you see on screen is
> calculated from the accounting ledger, live. Nothing is typed in twice and
> nothing is stored as a summary that could go stale. If a number is on the
> screen, it came from the books."

---

## 1 · The dashboard (1 minute)

Land on `/dashboard`.

> "This is the owner's morning view. Cash position, profit, who owes us money,
> who we owe money to."

Point at each:

- **Net profit 74,50,307** — income minus expenses for the chosen dates
- **Cash & bank 64,21,574** — with the cash and bank split shown underneath
- **Receivables 1,35,81,957** — money customers still owe us
- **Payables 1,01,97,727** — money we still owe suppliers

Click **FY** in the date bar and watch every figure recalculate.

> "There is no cache and no stored total. Changing the dates re-runs the whole
> calculation against the ledger. That is why it always agrees with the books."

Then point at the three cards at the top:

> "These are shortcuts. Each tile shows exactly the same number as the list it
> opens — if it says 25 drafts, clicking it gives you 25 drafts. That sounds
> obvious, but it's easy to get wrong, and a dashboard you can't trust is worse
> than no dashboard."

Open the **Sales / Purchase / Account / Report** menu at the top to show the
whole application in one place.

---

## 2 · Master data (1 minute)

Click through **Contacts → Products**.

> "This is the reference data the business runs on. 204 customers and suppliers,
> 156 products."

Show on any list:

- Search, filter, sort, paging
- The **list / kanban** toggle (top right on Products)
- Photos on the kanban cards

> "Every list works the same way, so once you learn one screen you know them
> all. And nothing is ever really deleted — records that are used in accounting
> can only be archived, because deleting them would put a hole in the history."

Mention **Chart of Accounts**, **Journals** and **Analytic Accounts** exist too:

> "Chart of accounts is the list of buckets money can sit in. Analytic accounts
> are cost centres — so you can ask 'how did the showroom do?' separately from
> 'how did online do?'"

---

## 3 · A purchase, end to end (1.5 minutes)

**Purchase Orders → open one → Vendor Bills → open a bill.**

> "The flow is the same one a real business follows.
>
> First a **purchase order** — that's us telling a supplier what we want. It's
> just a document; it doesn't touch the accounts.
>
> Then the supplier delivers and sends a **bill**. When we post that bill, three
> things happen at once: the accounting entry is written, the stock goes up, and
> the amount we owe goes up."

On the bill, scroll to the journal entry and read it out:

> "Debit expenses and input tax, credit creditors. That's double-entry
> bookkeeping — every transaction touches at least two accounts, and the two
> sides must match to the paisa."

Click **PDF** to download the bill.

---

## 4 · A sale, end to end (1.5 minutes)

**Sales Orders → Customer Invoices → open INV/00002.**

> "Same shape on the sales side. Sales order, then invoice."

Show:

- The **journal entry** — Dr Debtors, Cr Sales income and tax
- **Pay** → the dialog already knows the customer and the outstanding amount
- **PDF** → a proper invoice you could actually send

> "When I post this invoice, the invoice record and its accounting entry are
> written in a single database transaction. If either one fails, neither
> exists. You can never end up with an invoice that isn't in the books, or an
> entry with no invoice behind it."

Then the point worth landing:

> "And once it's posted, it can't be edited or deleted. The database itself
> refuses — there's a trigger that rejects the change. If you got something
> wrong, you post a reversal. That's how real accounting works: you never rub
> out history, you correct it in the open."

---

## 5 · Payments (1 minute)

**Payments → Register payment.**

> "A payment doesn't have to belong to one invoice. A customer might send one
> cheque covering four invoices."

Pick a customer and show their open invoices with an amount box against each.

> "You enter what they paid, split it across their invoices, and anything left
> over is held on their account as an advance. The server re-checks every
> amount against the live balance, so you can't accidentally allocate more than
> is owed — or pay off somebody else's invoice."

---

## 6 · The reports (2 minutes)

**Reports → Trial Balance.**

> "Total debits equal total credits. That has to be true, and here's how we make
> sure of it in three separate places:
>
> One, the code. There's only one way to create an accounting entry, and it
> refuses to build one that doesn't balance.
>
> Two, the database. Even if you bypassed the application completely and wrote
> SQL by hand, a constraint checks the entry at the moment you save and rejects
> it if it doesn't balance.
>
> Three, the tests. We have a test that deliberately tries to sneak an
> unbalanced entry in through raw SQL, and it proves the database throws it out."

**Reports → Balance Sheet.**

> "Assets equal liabilities plus capital. The green banner confirms it."

**Reports → Profit & Loss.** Then hit **PDF** and **CSV**.

> "Both files are generated on the server from the same code the screen uses.
> So the PDF you email your accountant can't disagree with what you're looking
> at."

Mention the rest quickly:

> "There's also stock, customer and supplier outstanding, ageing — which buckets
> overdue money by how late it is — a partner ledger showing one customer's full
> history, and a general ledger with a running balance on any account."

---

## 7 · Budgets (1 minute)

**Budgets** — show the donut on each row, then switch to **Kanban view**.

> "You plan how much you expect to spend or earn against each cost centre. The
> only number stored is the plan. Committed and achieved are recomputed from
> confirmed orders and the posted ledger every time you look."

Open one budget:

> "Budgets have a proper lifecycle — draft, confirmed, revised, cancelled. If
> the plan changes mid-year you create a revision, which keeps the original
> intact so you can see what you originally said you'd do."

---

## 8 · The customer portal (1 minute)

Sign out. Sign in as **`nimeshp` / `ChangeMe!123`**.

> "Customers get their own login. They see their invoices, what they owe, and
> they can pay and download a PDF. They cannot see anything else."

Then the security point:

> "A portal user is tied to exactly one customer record. Every single query
> filters on that customer's id as part of the database query itself — not as a
> check afterwards that somebody could forget to write.
>
> If I take another customer's invoice id and paste it into the address bar, I
> get a 'not found'. It doesn't even tell me the document exists. There's a test
> that tries exactly that with a real id belonging to somebody else."

Try it live if you're feeling confident.

---

## What we actually built (say this if you have time)

> "Three types of user. The **owner** can do everything. An **accountant** can
> record transactions and see reports, but can't manage users or settings. A
> **customer** only sees their own documents.
>
> The full set of screens: contacts, products, chart of accounts, journals,
> analytic accounts, purchase orders, vendor bills, sales orders, customer
> invoices, payments, journal entries, stock, budgets, nine reports, a customer
> portal, user management, company settings, and an audit log that records who
> did what and when.
>
> And it's tested — 183 small tests for the calculations, 82 running against a
> real PostgreSQL database, and 56 that drive the actual browser."

---

## Why this is better than a normal CRUD app

Pick two or three of these, don't read all of them:

**The ledger is the single source of truth.** Orders, bills and invoices are
just paperwork. Every report reads from the accounting entries, so a report can
never disagree with the books.

**Money is never a decimal number in code.** Computers get `0.1 + 0.2` wrong.
We store money as exact database decimals and never convert it to a normal
number — the code that would let you do it by accident is blocked by a lint
rule.

**History can't be rewritten.** Posted entries are immutable at the database
level. Corrections happen by reversal, and every entry records who posted it,
when, and which document it came from.

**Security is enforced on the server, three times over.** Hiding a button is
not security. There's route protection, a permission check on every single
action, and row-level filtering on every query. If anything is unclear, it
denies access rather than allowing it.

**Nothing is calculated in the browser.** All the accounting lives in reusable
server-side services. The screens only display what they're given.

---

## Questions you might get

**"What happens if two people do this at the same time?"**
Every operation that touches the ledger runs inside one database transaction.
Either all of it happens or none of it does.

**"Can I close a period so nobody edits old data?"**
Yes — Company Settings has an accounting lock date. Nothing can be posted on or
before it, and the date can only move forward, never back.

**"How do I get my data out?"**
Every report has CSV. Balance sheet and profit & loss also have PDF, and so does
every invoice and bill.

**"Is the demo data real?"**
It's generated, but it's generated *through the application* — every invoice
and payment went through the same code you'd use by hand. That's why the books
still balance. We didn't insert rows straight into the database.

---

## Known gaps — say these before they're found

> "Three things I'd fix next.
>
> Inventory is **periodic**, not perpetual. A purchase becomes an expense the
> moment you buy it, rather than when you sell it. It's a normal small-business
> approach, but a bigger system would track cost of goods sold properly.
>
> The reports work fine at this size but haven't been load-tested with years of
> data. The fix is a pre-calculated monthly balance table, and the code is
> already structured so that swap wouldn't change anything else.
>
> The PDFs use built-in fonts, so a product named in Hindi wouldn't print
> correctly. That needs an embedded font."
