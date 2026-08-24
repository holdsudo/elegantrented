import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getRental, listPayments } from "@/lib/queries";
import { addDays, formatDay, formatDayWithWeekday, relativeDay, today, toInputDay } from "@/lib/dates";
import { centsToInput, formatMoney } from "@/lib/money";
import { getSettings, settingNumber } from "@/lib/settings";
import {
  displayRentalNumber,
  gownLabel,
  isOverdue,
  paymentLabel,
  paymentState,
  statusLabel
} from "@/lib/rentals";
import { deletePaymentAction, deleteRentalAction, recordPaymentAction, setRentalStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rental = await getRental(id);
  return { title: rental ? `${displayRentalNumber(rental.number)} · ${rental.customerName}` : "Rental" };
}

export default async function RentalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const rental = await getRental(id);
  if (!rental) notFound();
  const payments = await listPayments(id);

  const settings = await getSettings();
  const currency = settings.currency;
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const balanceCents = rental.priceCents - paidCents;
  const pay = paymentState(rental.priceCents, paidCents);
  const overdue = isOverdue(rental, returnOffset, now);
  const dueBack = rental.returnDate ?? addDays(rental.partyDate, returnOffset);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="row-tight">
            <h1>{rental.customerName}</h1>
            <span className="pill brand mono">{displayRentalNumber(rental.number)}</span>
            {overdue ? (
              <span className="pill bad">Overdue</span>
            ) : (
              <span className="pill">{statusLabel(rental.status)}</span>
            )}
            <span className={balanceCents > 0 ? "pill warn" : "pill good"}>{paymentLabel(pay)}</span>
          </div>
          <div className="page-sub">
            Party {formatDayWithWeekday(rental.partyDate)} · {relativeDay(rental.partyDate, now)}
          </div>
        </div>
        <div className="row-tight no-print">
          <Link href={`/rentals/${rental.id}/edit`} className="btn primary">
            Edit
          </Link>
          <Link href="/" className="btn">
            Ledger
          </Link>
        </div>
      </div>

      <div className="page">
        {overdue ? (
          <div className="note bad">
            <span className="note-title">This gown is past due</span>
            <span>
              Due back {formatDay(dueBack)} — {relativeDay(dueBack, now)}. Mark it returned once it's in.
            </span>
          </div>
        ) : null}

        <div className="grid grid-2">
          <div className="card card-pad stack">
            <h2>Rental</h2>
            <dl className="stack" style={{ margin: 0, gap: 10 }}>
              <Row
                label="Name"
                value={
                  rental.customerId ? (
                    <Link href={`/customers/${rental.customerId}`}>{rental.customerName}</Link>
                  ) : (
                    rental.customerName
                  )
                }
              />
              <Row label="Phone" value={rental.phone || "—"} mono />
              <Row label="Email" value={rental.email || "—"} />
              <Row label="Date written" value={formatDay(rental.writtenDate)} />
              <Row label="Date of party" value={formatDayWithWeekday(rental.partyDate)} />
              <Row
                label="Pickup"
                value={rental.pickupDate ? formatDay(rental.pickupDate) : "—"}
              />
              <Row label="Return" value={rental.returnDate ? formatDay(rental.returnDate) : `${formatDay(dueBack)} (suggested)`} />
              <Row
                label="Gown"
                value={
                  rental.gown ? (
                    <Link href={`/gowns/${rental.gown.id}`}>
                      {gownLabel(rental.gown, null)}
                      {rental.gown.size ? ` · size ${rental.gown.size}` : ""}
                    </Link>
                  ) : (
                    rental.gownText || "—"
                  )
                }
              />
            </dl>
            {rental.notes ? (
              <>
                <h3 style={{ marginTop: 6 }}>Notes</h3>
                <p className="tiny" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {rental.notes}
                </p>
              </>
            ) : null}
          </div>

          <div className="stack">
            <div className="card card-pad stack">
              <h2>Money</h2>
              <div className="grid grid-3">
                <div className="stat" style={{ padding: 0 }}>
                  <span className="stat-label">Price</span>
                  <span className="stat-value" style={{ fontSize: "1.2rem" }}>
                    {formatMoney(rental.priceCents, currency)}
                  </span>
                </div>
                <div className="stat" style={{ padding: 0 }}>
                  <span className="stat-label">Paid</span>
                  <span className="stat-value" style={{ fontSize: "1.2rem" }}>
                    {formatMoney(paidCents, currency)}
                  </span>
                </div>
                <div className="stat" style={{ padding: 0 }}>
                  <span className="stat-label">Balance</span>
                  <span
                    className={balanceCents > 0 ? "stat-value alert" : "stat-value good"}
                    style={{ fontSize: "1.2rem" }}
                  >
                    {formatMoney(balanceCents, currency)}
                  </span>
                </div>
              </div>

              <form action={recordPaymentAction} className="stack no-print" style={{ gap: 10 }}>
                <input type="hidden" name="rentalId" value={rental.id} />
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="amount">Record a payment</label>
                    <input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      placeholder={balanceCents > 0 ? centsToInput(balanceCents) : "0.00"}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="method">Method</label>
                    <select id="method" name="method" defaultValue="Cash">
                      <option>Cash</option>
                      <option>Card</option>
                      <option>Check</option>
                      <option>Zelle</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="paidOn">Date</label>
                    <input id="paidOn" name="paidOn" type="date" defaultValue={toInputDay(now)} />
                  </div>
                </div>
                <div className="row">
                  <button type="submit" className="btn primary small">
                    Add payment
                  </button>
                </div>
              </form>

              {payments.length > 0 ? (
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="mono">Date</th>
                        <th>Method</th>
                        <th className="num">Amount</th>
                        <th className="no-print" />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="mono">{formatDay(payment.paidOn)}</td>
                          <td>
                            {payment.method}
                            {payment.note ? <span className="cell-sub">{payment.note}</span> : null}
                          </td>
                          <td className="num">{formatMoney(payment.amountCents, currency)}</td>
                          <td className="num no-print">
                            <form action={deletePaymentAction}>
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <input type="hidden" name="rentalId" value={rental.id} />
                              <button type="submit" className="btn small danger">
                                Remove
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="tiny muted" style={{ margin: 0 }}>
                  No payments recorded yet.
                </p>
              )}
            </div>

            <div className="card card-pad stack no-print">
              <h2>Move it along</h2>
              <div className="row">
                {(["BOOKED", "OUT", "RETURNED", "CANCELLED"] as const).map((status) => (
                  <form key={status} action={setRentalStatusAction}>
                    <input type="hidden" name="rentalId" value={rental.id} />
                    <input type="hidden" name="status" value={status} />
                    <button
                      type="submit"
                      className={status === rental.status ? "btn small primary" : "btn small"}
                      disabled={status === rental.status}
                    >
                      {statusLabel(status)}
                    </button>
                  </form>
                ))}
              </div>
              <form action={deleteRentalAction} className="row">
                <input type="hidden" name="rentalId" value={rental.id} />
                <button type="submit" className="btn small danger">
                  Delete this rental
                </button>
                <span className="tiny muted">Cancelling is usually better — it keeps the history.</span>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  mono
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
      <dt className="stat-label" style={{ minWidth: 108 }}>
        {label}
      </dt>
      <dd className={mono ? "mono" : undefined} style={{ margin: 0, fontWeight: 550 }}>
        {value}
      </dd>
    </div>
  );
}
