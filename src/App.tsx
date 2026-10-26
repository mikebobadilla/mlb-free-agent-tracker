import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { PlayerDetail } from "./pages/PlayerDetail";

export type Route = { name: "dashboard" } | { name: "player"; mlbId: number };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "dashboard" });

  if (route.name === "player") {
    return <PlayerDetail mlbId={route.mlbId} onBack={() => setRoute({ name: "dashboard" })} />;
  }
  return <Dashboard onOpenPlayer={(mlbId) => setRoute({ name: "player", mlbId })} />;
}
