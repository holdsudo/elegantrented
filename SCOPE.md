# Gown Rental CRM — Scope v2

**Status:** draft for review · 2026-08-21 (supersedes v1)
**Directory:** `~/dress-crm` · the app itself is unbranded (§7)

> **What changed from v1.** You said the main things needed are Name, Date, Date of
> party, Number, Price, Paid, Gown description/#. That's a booking ledger, not the
> ten-phase rental platform I scoped first. This version is built around those seven
> fields. Everything from v1 that isn't needed for them is parked in §9 — on record,
> not deleted, not built.

---

## 1. What this is

A **booking ledger** for a gown rental shop, with just enough system around it that the
ledger can't lie to you: every rental is one row, every gown is a numbered physical
thing, and the app won't let you promise the same gown to two parties on the same
weekend.

It runs in a browser on your own hardware. One business, one login screen, no branding.

---

## 2. The record

The seven fields you named, made concrete. This is the whole product — the rest of the
doc is just how it's presented and kept honest.

| Field | Stored as | Notes |
|---|---|---|
| **Rental #** | auto `R-1042` | Sequential, assigned on save. Never reused. This is what you say on the phone. |
| **Name** | text | Customer. Searchable. |
| **Phone** | text, normalized | Also searchable — typing `5551234` finds the rental. |
| **Date** | date, defaults to today | The date the rental was written up. |
| **Date of party** | date | The event. **This is the field everything sorts and alerts on.** |
| **Pickup / Return** | date, optional | Auto-suggested from the party date (e.g. pickup −2 days, return +2), overridable. Leave blank and the party date carries it. |
| **Gown** | link to a gown record | Shows as `#118 — Ivory A-line, beaded bodice, size 8`. |
| **Price** | money | What the rental costs. |
| **Paid** | money | Amount received so far. |
| **Balance** | computed | `Price − Paid`, never typed. Drives the status pill. |
| **Status** | derived | `Unpaid` · `Deposit` · `Paid in full` — plus `Overdue` if the return date has passed. |
| **Notes** | text | Free field. Alterations, who referred them, anything. |

### Two things I resolved rather than guess

- **"Number"** — I built both. Every rental gets an auto **Rental #**, and there's a
  separate **Phone** field. Whichever you meant, it's there, and neither costs anything.
- **"Paid"** — stored as an **amount**, not a checkbox, with the balance computed. A
  checkbox is just the case where Paid equals Price, so this covers both readings and
  also answers "who still owes me money" without a second system.

If you'd rather **Date** mean the pickup date instead of the write-up date, that's a
one-line change — say so and I'll flip it.

---

## 3. Gowns

A gown is a numbered physical object, not just text in a row. This is the only thing
I've added beyond your list, and it's what makes `Gown #` mean something.

| Field | Notes |
|---|---|
| **Gown #** | `118` — the tag number on the garment |
| **Description** | "Ivory A-line, beaded bodice" |
| **Size** | |
| **Color** | |
| **Photo(s)** | one or more, uploaded from a phone |
| **Price** | default rental price, auto-fills on new rentals |
| **Condition** | New · Good · Fair · Retired |
| **Status** | derived: **In** · **Out** · **Due back** |
| **Notes** | alterations made, damage, cleaning |

**The double-booking check.** Pick a gown for a party date and the app checks whether
it's already promised anywhere near that date. If it is, you get a warning naming the
other rental and its party date. You can override it — sometimes you know something the
app doesn't — but you'll never do it by accident.

That check is the single most valuable line of code in the build, and it only exists
because gowns are numbered records instead of typed-in text.

---

## 4. Screens

Five. That's the whole app.

### Ledger — the home screen
The list, and 90% of the use. Columns are exactly your fields:

```
R-#    Name          Phone       Date      Party date   Gown          Price   Paid    Balance
1042   Maria Colon   555-0134    08/21     09/14        #118 Ivory…   225.00  100.00  125.00
```

- Search box hits name, phone, gown # and description at once
- Default sort: **party date, soonest first**
- Filters: upcoming · this month · balance due · overdue returns · all
- Click a row to open it; **Add rental** button top-right
- Export to CSV / Excel

### Rental — add and edit
One short form, one screen, no tabs. Picking a gown auto-fills the price and runs the
double-booking check. Picking a party date auto-suggests pickup and return.

### Gowns
The inventory list with photos, numbers, and current status. Click one to see its full
rental history — who wore it, when, what it earned.

### Calendar
Month view of party dates, with pickups and returns marked. Answers "what's happening
this weekend" without reading the ledger.

### Money
Everyone with a balance, oldest first. Total outstanding at the top.

Plus **Settings** — shop name, address, default prices, pickup/return offsets, users.

---

## 5. Color scheme

Light brown primary, warm neutrals, the same airy Booqable-style layout as v1 —
white cards on a soft paper ground, generous space, thin rules.

```css
:root {
  --bg:           #F7F3EE;  /* warm paper ground        */
  --card:         #FFFFFF;
  --card-alt:     #FBF7F2;  /* zebra rows, wells        */
  --text:         #2B2118;  /* warm near-black          */
  --muted:        #7C6B5B;
  --border:       #E4DACE;
  --border-soft:  #EFE7DD;

  --primary:      #A57C52;  /* LIGHT BROWN — buttons, fills, brand */
  --primary-ink:  #7B5735;  /* same hue, darkened for text & links */
  --primary-soft: #F3E9DE;  /* selected rows, hover, tints         */

  --success:      #4E7B48;  --success-soft: #EBF2E9;   /* paid in full  */
  --warn:         #C68A21;  --warn-soft:    #FBF1DD;   /* balance due   */
  --danger:       #B3453F;  --danger-soft:  #F8EAE9;   /* overdue       */
}
```

`--primary-ink` exists because #A57C52 is too light for small text on white — links and
labels use the darker step, fills and buttons use the light brown itself. Same hue,
readable both ways.

A dark set is defined at the same time so it's never a retrofit. The primary is
overridable per install (§7), so "light brown" can become any color later without
touching code.

---

## 6. Stack

Same as the CAF CRM, because it's proven on this hardware and I can lift working files
straight across.

- **Next.js 15** (App Router) · React 19 · TypeScript
- **PostgreSQL** via **Prisma** — its own database, nothing shared with CAF
- One `globals.css` with CSS custom properties. No Tailwind, no component library
- Login: HMAC-signed session cookie + bcrypt, ported from `lib/auth.ts`
- Photos: attachment table, ported from `lib/file-attachments.ts`
- CSV/Excel export: ported from `lib/csv.ts` + `lib/spreadsheet.ts`
- Rental numbering: adapted from `lib/reference-numbers.ts`
- App shell and UI bits (`app-shell.tsx`, `ui.tsx`): ported, restyled to §5
- Runs as its own Docker container on the Pi, its own port, LAN-only

**Roughly 6 tables:** `Rental`, `Gown`, `GownPhoto`, `Payment`, `User`, `AppSetting`.
v1 had ~38.

---

## 7. Unbranded

No name, logo, or color is hardcoded. `brandName` (default "Rental Manager"),
`brandLogoUrl`, `brandPrimary`, `currency`, `taxRate`, `addressBlock`, and the
pickup/return offsets all live in a settings table you can edit in the app.

---

## 8. Phases

| # | Phase | Delivers |
|---|---|---|
| **P0** | **Ledger** | App, login, the rental record, add/edit/search/sort/export. **Usable the day it lands.** |
| **P1** | **Gowns** | Numbered gowns with photos, gown history, and the double-booking warning |
| **P2** | **Money** | Payments against a rental, balance list, printable receipt / rental agreement PDF |
| **P3** | **Calendar** | Month view, this-weekend view, optional email or text reminders |
| **P4** | **Import** | Pull your existing spreadsheet or paper ledger in, so history isn't lost |

P0 is small. If your current ledger is a notebook or a spreadsheet, P0 + P4 alone
replaces it.

---

## 9. Parked — not building unless you ask

From v1, on record so nothing is lost: size variants and size systems · serialized
units with wear counts · cleaning turnaround as a workflow stage · measurement profiles
· wedding-party group orders with per-wearer sizing · alteration/tailor queue · return
inspection and damage charges · pricing rule engine with seasonal multipliers · security
deposit pre-authorization · payment processor integration · triggered email campaigns ·
utilization and shortage reporting · public storefront with self-service booking ·
JSON API and webhooks.

Any of these can be added later on top of the ledger without a rewrite — the data model
in §2–3 is a clean subset of the v1 one, not a different shape.

---

## 10. Assumptions

1. **Hosting:** its own Docker container on the Pi, own Postgres database, own port,
   LAN-only. No exposure to the internet, no bridge to CAF, ever.
2. **One shop, one location.** Multiple locations would be a small addition, not a
   rewrite — say if you need it.
3. **Payments are recorded, not processed.** Cash, check, card-on-terminal all get
   logged as amounts. Hooking up a real processor is P2+ and only if you want it.
4. **One gown per rental row** is the normal case. If a rental regularly includes a
   veil, shoes or a second dress, tell me and rentals get multiple gown lines instead
   of one — worth deciding before P0.
5. **Everyone who logs in can see everything.** Roles can come later if staff grows.

---

## 11. Still open

- Does **Date** mean written-up or pickup? (§2)
- Can one rental include **more than one gown**? (§10.4)
- Do you already have a **spreadsheet or ledger to import**?
- Roughly how many gowns, and how many rentals a month?
