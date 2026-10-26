import { useEffect, useState } from "react";
import { fetchPlayers } from "../api/client";
import type { PlayerDashboard } from "../models";

export function Dashboard({ onOpenPlayer }: { onOpenPlayer: (mlbId: number) => void }) {
  const [dashboards, setDashboards] = useState<PlayerDashboard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlayers()
      .then((d) => { if (!cancelled) setDashboards(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Free Agent Dashboard</h1>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {dashboards.map((d) => (
            <tr key={d.player.id}>
              <td>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onOpenPlayer(d.player.mlbId); }}
                >
                  {d.player.name}
                </a>
              </td>
              <td>{d.player.position}</td>
              <td>{d.player.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
