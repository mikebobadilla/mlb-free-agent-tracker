import { useEffect, useState } from "react";
import { fetchSyncStatus } from "./api/client";
import type { SyncStatus } from "./jobs/syncStatus";
import { Dashboard } from "./pages/Dashboard";
import { PlayerDetail } from "./pages/PlayerDetail";

export type Route = { name: "dashboard" } | { name: "player"; mlbId: number };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "dashboard" });

  return (
    <>
      <SyncBanner />
      {route.name === "player" ? (
        <PlayerDetail mlbId={route.mlbId} onBack={() => setRoute({ name: "dashboard" })} />
      ) : (
        <Dashboard onOpenPlayer={(mlbId) => setRoute({ name: "player", mlbId })} />
      )}
      <Attribution />
    </>
  );
}

// Visible only when the sync is off or its last run failed; hidden when healthy or unknown (D-032).
export function SyncBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    fetchSyncStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status || status.ok) return null;
  return (
    <div className="sync-banner" role="alert">
      <strong>{status.scheduled ? "The last data sync failed." : "The nightly data sync is not running."}</strong>{" "}
      Data below may be out of date.
      {status.lastError && <> Error: {status.lastError}</>}
      {status.lastSuccessAt && <> Last good sync: {new Date(status.lastSuccessAt).toLocaleString()}.</>}
    </div>
  );
}

// Notices required by the data licenses (D-027). The Retrosheet wording is fixed by its notice.
function Attribution() {
  return (
    <footer className="attribution">
      <p>
        The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested
        parties may contact Retrosheet at <a href="https://www.retrosheet.org">"www.retrosheet.org"</a>.
      </p>
      <p>
        Contains information from the{" "}
        <a href="https://github.com/chadwickbureau/register">Chadwick Baseball Bureau Register</a>, which is made
        available under the <a href="https://opendatacommons.org/licenses/by/1-0/">ODC Attribution License</a>.
      </p>
      <p>
        Signing dates from MLB transactions, © MLB Advanced Media, L.P. Contract terms from the public reports
        linked on each player's page.
      </p>
    </footer>
  );
}
