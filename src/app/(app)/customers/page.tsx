import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDay, relativeDay, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { listCustomerRollups } from "@/lib/queries";
import { withBase } from "@/lib/base-path";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const settings = await getSettings();
  const currency = settings.currency;
  const now = today();

  const customers = await listCustomerRollups(query || undefined);

  const lifetime = customers.reduce((sum, c) => sum + c.spentCents, 0);
  const repeat = customers.filter((c) => c.rentals > 1).length;
  const owing = customers.filter((c) => c.balanceCents > 0);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Customers</h1>
          <div className="page-sub">
            Built from the book. Every rental attaches to a person automatically.
          </div>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Customers</span>
            <span className="stat-value">{customers.length}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Came back</span>
            <span className="stat-value">{repeat}</span>
            <span className="stat-note">
              {customers.length ? Math.round((repeat / customers.length) * 100) : 0}% rented twice or more
            </span>
          </div>
          <div className="card stat">
            <span className="stat-label">Lifetime collected</span>
            <span className="stat-value">{formatMoney(lifetime, currency)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Owing</span>
            <span className={owing.length ? "stat-value alert" : "stat-value"}>{owing.length}</span>
            <span className="stat-note">
              {formatMoney(owing.reduce((sum, c) => sum + c.balanceCents, 0), currency)} outstanding
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <form className="search-bar" action={withBase("/customers")} method="get">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Name, phone or email"
                aria-label="Search customers"
              />
              <button type="submit" className="btn small">
                Search
              </button>
              {query ? (
                <Link href="/customers" className="btn small">
                  Clear
                </Link>
              ) : null}
            </form>
            <span className="tiny muted">Sorted by lifetime spend</span>
          </div>

          {customers.length === 0 ? (
            <div className="empty">
              <strong>{query ? "No one matches that" : "No customers yet"}</strong>
              <span>Customers appear here as soon as a rental is written up.</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="mono">Phone</th>
                    <th className="num">Rentals</th>
                    <th className="num">Spent</th>
                    <th className="num">Balance</th>
                    <th className="mono">Last party</th>
                    <th className="mono">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link href={`/customers/${customer.id}`} className="row-link">
                          {customer.name}
                        </Link>
                        {customer.email ? <span className="cell-sub">{customer.email}</span> : null}
                      </td>
                      <td className="mono">{customer.phone || "—"}</td>
                      <td className="num">
                        {customer.rentals}
                        {customer.cancelled > 0 ? (
                          <span className="cell-sub">{customer.cancelled} cancelled</span>
                        ) : null}
                      </td>
                      <td className="num">{formatMoney(customer.spentCents, currency)}</td>
                      <td className="num">
                        {customer.balanceCents > 0 ? (
                          <span className="pill warn">
                            {formatMoney(customer.balanceCents, currency)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="mono">
                        {customer.lastPartyDate ? formatDay(customer.lastPartyDate) : "—"}
                      </td>
                      <td className="mono">
                        {customer.nextPartyDate ? (
                          <>
                            {formatDay(customer.nextPartyDate)}
                            <span className="cell-sub">
                              {relativeDay(customer.nextPartyDate, now)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
