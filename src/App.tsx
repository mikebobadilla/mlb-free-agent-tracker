import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { PlayerDetail } from "./pages/PlayerDetail";

export type Route = { name: "dashboard" } | { name: "player"; mlbId: number };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "dashboard" });

  return (
    <>
      {route.name === "player" ? (
        <PlayerDetail mlbId={route.mlbId} onBack={() => setRoute({ name: "dashboard" })} />
      ) : (
        <Dashboard onOpenPlayer={(mlbId) => setRoute({ name: "player", mlbId })} />
      )}
      <Attribution />
    </>
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
