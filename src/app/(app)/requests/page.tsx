import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, formatDayWithWeekday, relativeDay, today } from "@/lib/dates";
import { getSettings, settingNumber } from "@/lib/settings";
import { gownLabel, occupiedWindow } from "@/lib/rentals";
import { listRequests, takenGownIds } from "@/lib/queries";
import {
  confirmRequestAction,
  declineRequestAction,
  deleteRequestAction,
  reopenRequestAction
} from "./actions";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams
}: {
  searchParams: Promise<{ conflict?: string; show?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const showAll = params.show === "all";

  const settings = await getSettings();
  const pickupOffset = settingNumber(settings, "pickupOffsetDays", 2);
  const returnOffset = settingNumber(settings, "returnOffsetDays", 2);
  const now = today();

  const requests = await listRequests(showAll ? undefined : "PENDING");

  // Which of these dates are already spoken for by a confirmed rental.
  const clashes = new Set<string>();
  for (const request of requests) {
    if (!request.gownId || request.status !== "PENDING") continue;
    const window = occupiedWindow(request, pickupOffset, returnOffset);
    const taken = await takenGownIds(window.from, window.to);
    if (taken.has(request.gownId)) clashes.add(request.id);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Requests</h1>
          <div className="page-sub">
            From the website. Nothing here holds a date until you confirm it.
          </div>
        </div>
        <div className="row-tight">
          <Link href={showAll ? "/requests" : "/requests?show=all"} className="btn small">
            {showAll ? "Pending only" : "Show all"}
          </Link>
          <a href="/browse" target="_blank" rel="noreferrer" className="btn small">
            View the shop ↗
          </a>
        </div>
      </div>

      <div className="page">
        {params.conflict ? (
          <div className="note warn">
            <span className="note-title">That dress is already booked around those dates</span>
            <span>
              Nothing was changed. Use <strong>Confirm anyway</strong> on that request if you know
              it works, or decline it and offer another dress.
            </span>
          </div>
        ) : null}

        {requests.length === 0 ? (
          <div className="card empty">
            <strong>{showAll ? "No requests yet" : "Nothing waiting"}</strong>
            <span>
              Requests from the website land here. Share{" "}
              <a href="/browse" target="_blank" rel="noreferrer">
                the shop page
              </a>{" "}
              to start taking them.
            </span>
          </div>
        ) : (
          <div className="stack">
            {requests.map((request) => {
              const clashes_ = clashes.has(request.id);
              const window = occupiedWindow(request, pickupOffset, returnOffset);

              return (
                <div key={request.id} className="card card-pad stack request-card">
                  <div className="row">
                    <div className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
                      <div className="row-tight">
                        <h2>{request.customerName}</h2>
                        {request.status === "PENDING" ? (
                          <span className="pill warn">Pending</span>
                        ) : request.status === "CONFIRMED" ? (
                          <span className="pill good">Confirmed</span>
                        ) : (
                          <span className="pill">Declined</span>
                        )}
                        {clashes_ ? <span className="pill bad">Dress already booked</span> : null}
                      </div>
                      <span className="tiny muted">
                        Asked {formatDay(request.createdAt)} · {relativeDay(request.createdAt, now)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-3">
                    <div className="stat" style={{ padding: 0 }}>
                      <span className="stat-label">Party</span>
                      <span style={{ fontWeight: 600 }}>
                        {formatDayWithWeekday(request.partyDate)}
                      </span>
                      <span className="stat-note">{relativeDay(request.partyDate, now)}</span>
                    </div>
                    <div className="stat" style={{ padding: 0 }}>
                      <span className="stat-label">Dress</span>
                      <span style={{ fontWeight: 600 }}>
                        {request.gown ? (
                          <Link href={`/gowns/${request.gown.id}`}>
                            {gownLabel(request.gown, null)}
                          </Link>
                        ) : (
                          request.gownText || "—"
                        )}
                      </span>
                      <span className="stat-note">
                        Would be out {formatDay(window.from)} → {formatDay(window.to)}
                      </span>
                    </div>
                    <div className="stat" style={{ padding: 0 }}>
                      <span className="stat-label">Reach them</span>
                      <span style={{ fontWeight: 600 }}>
                        {request.phone ? <a href={`tel:${request.phone}`}>{request.phone}</a> : "—"}
                      </span>
                      {request.email ? (
                        <a href={`mailto:${request.email}`} className="stat-note">
                          {request.email}
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {request.notes ? (
                    <p className="tiny" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {request.notes}
                    </p>
                  ) : null}

                  {request.status === "PENDING" ? (
                    <div className="row">
                      <form action={confirmRequestAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        {clashes_ ? <input type="hidden" name="override" value="1" /> : null}
                        <button type="submit" className="btn primary small">
                          {clashes_ ? "Confirm anyway" : "Confirm — book the date"}
                        </button>
                      </form>
                      <form action={declineRequestAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button type="submit" className="btn small">
                          Decline
                        </button>
                      </form>
                      <span className="tiny muted">
                        Confirming creates the rental and closes the date.
                      </span>
                    </div>
                  ) : (
                    <div className="row">
                      {request.rentalId ? (
                        <Link href={`/rentals/${request.rentalId}`} className="btn small">
                          Open the rental
                        </Link>
                      ) : null}
                      <form action={reopenRequestAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button type="submit" className="btn small">
                          Move back to pending
                        </button>
                      </form>
                      <form action={deleteRequestAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button type="submit" className="btn small danger">
                          Delete
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
