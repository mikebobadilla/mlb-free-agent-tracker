import { useEffect, useState } from "react";
import { fetchPlayers } from "../api/client";
import type { PlayerDashboard } from "../models";

function fmtWar(war: number | null): string {
  if (war == null || war <= 0) return "-";
  return war.toFixed(1);
}

function fmtStat(v: number | null): string {
  return v == null ? "-" : v.toFixed(2);
}

function fmtAvg(v: number | null): string {
  if (v == null) return "-";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? `.${s.slice(2)}` : s;
}

function fmtAge(age: number | null): string {
  return age == null ? "-" : String(age);
}

function fmtSeason(season: number | null): string {
  return season == null ? "-" : String(season);
}

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

  if (error) {
    return (
      <div>
        <nav><a href="/" className="brand">MLB Free Agent Tracker</a></nav>
        <main>
          <h1>Free Agent Dashboard</h1>
          <p>Error: {error}</p>
        </main>
      </div>
    );
  }

  return (
    <div>
      <nav><a href="/" className="brand">MLB Free Agent Tracker</a></nav>
      <main>
        <h1>Free Agent Dashboard</h1>
        {dashboards.length === 0 ? (
          <p>No players tracked yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Age</th>
                <th>Prev Team</th>
                <th>Season</th>
                <th>WAR</th>
                <th>OPS</th>
                <th>ERA</th>
                <th>WHIP</th>
                <th>FIP</th>
                <th>Contract Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboards.map((d) => {
                const p = d.player;
                return (
                  <tr key={p.id}>
                    <td><a href="#" onClick={(e) => { e.preventDefault(); onOpenPlayer(p.mlbId); }}>{p.name}</a></td>
                    <td>{p.position}</td>
                    <td>{fmtAge(p.age)}</td>
                    <td>{p.prevTeam ?? "-"}</td>
                    <td>{fmtSeason(p.season)}</td>
                    <td>{fmtWar(p.war)}</td>
                    <td>{fmtAvg(p.ops)}</td>
                    <td>{fmtStat(p.era)}</td>
                    <td>{fmtStat(p.whip)}</td>
                    <td>{fmtStat(p.fip)}</td>
                    <td>{p.contractExpiry ?? "-"}</td>
                    <td>
                      {d.contract ? (
                        <span className="badge signed">Signed ({d.contract.team})</span>
                      ) : (
                        <span className={`badge ${p.status}`}>{p.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
