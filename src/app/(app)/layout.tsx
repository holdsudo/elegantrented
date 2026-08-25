import { requireUser } from "@/lib/auth";
import { countPendingRequests, countUpcomingRentals, listLiveRentalSummaries } from "@/lib/queries";
import { getSettings, settingNumber } from "@/lib/settings";
import { addDays, today } from "@/lib/dates";
import { Nav, type NavItem } from "@/components/nav";
import { primaryTheme } from "@/lib/color";
import { logoutAction } from "@/app/login/actions";

/** "Elegant Rented" -> "ER" */
function brandInitials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const [upcoming, liveRentals, pendingRequests] = await Promise.all([
    countUpcomingRentals(now),
    listLiveRentalSummaries(),
    countPendingRequests()
  ]);

  const overdue = liveRentals.filter(
    (rental) =>
      (rental.status === "BOOKED" || rental.status === "OUT") &&
      (rental.returnDate ?? addDays(rental.partyDate, returnOffset)) < now
  ).length;

  const items: NavItem[] = [
    // The overdue count rides on Ledger rather than getting its own row — the
    // ledger's "Overdue" filter is where you'd act on it anyway.
    overdue > 0
      ? { href: "/", label: "Ledger", count: overdue, alert: true }
      : { href: "/", label: "Ledger", count: upcoming },
    { href: "/requests", label: "Requests", count: pendingRequests, alert: pendingRequests > 0 },
    { href: "/gowns", label: "Gowns" },
    { href: "/customers", label: "Customers" },
    { href: "/calendar", label: "Calendar" },
    { href: "/money", label: "Money" },
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: "Settings" }
  ];

  // Only emitted when the chosen color differs from the stylesheet's default.
  const theme =
    settings.brandPrimary && settings.brandPrimary !== "#A57C52"
      ? primaryTheme(settings.brandPrimary)
      : null;

  return (
    <div className="shell">
      {theme ? (
        <style>{`:root{--primary:${theme.primary};--primary-ink:${theme.primaryInk};--primary-soft:${theme.primarySoft};--on-primary:${theme.onPrimary};}`}</style>
      ) : null}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{brandInitials(settings.brandName)}</span>
          <span>{settings.brandName}</span>
        </div>
        <Nav items={items} />
        <div className="sidebar-foot">
          <span>{user.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn small" style={{ width: "100%" }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
