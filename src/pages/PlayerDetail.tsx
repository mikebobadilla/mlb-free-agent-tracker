import { useEffect, useState } from "react";
import { fetchPlayer } from "../api/client";
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

export function PlayerDetail({ mlbId, onBack }: { mlbId: number; onBack: () => void }) {
  const [data, setData] = useState<PlayerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlayer(mlbId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [mlbId]);

  if (error) {
    return (
      <div>
        <nav><a href="/" className="brand">MLB Free Agent Tracker</a></nav>
        <main>
          <a href="#" className="back" onClick={(e) => { e.preventDefault(); onBack(); }}>&larr; Back to Dashboard</a>
          <h1>Player</h1>
          <p>Error: {error}</p>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <nav><a href="/" className="brand">MLB Free Agent Tracker</a></nav>
        <main>
          <a href="#" className="back" onClick={(e) => { e.preventDefault(); onBack(); }}>&larr; Back to Dashboard</a>
          <h1>Loading...</h1>
        </main>
      </div>
    );
  }

  const p = data.player;
  const contract = data.contract;
  const rumors = data.rumors;
  const prediction = data.prediction;

  const hasHitting = p.obp != null || p.slg != null || p.ops != null;
  const hasPitching = p.era != null || p.whip != null || p.ip != null || p.k9 != null || p.fip != null;

  return (
    <div>
      <nav><a href="/" className="brand">MLB Free Agent Tracker</a></nav>
      <main>
        <a href="#" className="back" onClick={(e) => { e.preventDefault(); onBack(); }}>&larr; Back to Dashboard</a>

        <h1>{p.name}</h1>
        <p className="meta">{p.position} | Age {p.age ?? "-"} | Previously {p.prevTeam ?? "-"}</p>

        <h2>{p.season ? `${p.season} Season` : "Stats"}</h2>
        {p.season == null ? <p>No stats for this season or last season yet.</p> : null}
        <div className="stats-row">
          <div className="stat-box">
            <span className="stat-label">WAR</span>
            <span className="stat-value">{fmtWar(p.war)}</span>
          </div>
        </div>

        {hasHitting && (
          <>
            <h3>Hitting</h3>
            <div className="stats-row">
              <div className="stat-box">
                <span className="stat-label">OBP</span>
                <span className="stat-value">{fmtAvg(p.obp)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">SLG</span>
                <span className="stat-value">{fmtAvg(p.slg)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">OPS</span>
                <span className="stat-value">{fmtAvg(p.ops)}</span>
              </div>
            </div>
          </>
        )}

        {hasPitching && (
          <>
            <h3>Pitching</h3>
            <div className="stats-row">
              <div className="stat-box">
                <span className="stat-label">ERA</span>
                <span className="stat-value">{fmtStat(p.era)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">WHIP</span>
                <span className="stat-value">{fmtStat(p.whip)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">IP</span>
                <span className="stat-value">{fmtStat(p.ip)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">K/9</span>
                <span className="stat-value">{fmtStat(p.k9)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">FIP</span>
                <span className="stat-value">{fmtStat(p.fip)}</span>
              </div>
            </div>
            <p className="meta"><small>FIP uses a fixed league constant of 3.10, so it's approximate.</small></p>
          </>
        )}

        <h2>Status</h2>
        {contract ? (
          <div className="contract-card">
            <p><strong>Signed with:</strong> {contract.team}</p>
            {contract.years != null ? <p><strong>Years:</strong> {contract.years}</p> : null}
            {contract.totalValue != null ? <p><strong>Total Value:</strong> ${contract.totalValue}M</p> : null}
            {contract.aav != null ? <p><strong>AAV:</strong> ${contract.aav}M</p> : null}
            <p><strong>Signed:</strong> {contract.signedDate ?? "-"}</p>
          </div>
        ) : (
          <p>Status: <span className={`badge ${p.status}`}>{p.status}</span></p>
        )}

        <h2>Prediction</h2>
        {prediction ? (
          <div className="prediction-card">
            <p><strong>Predicted Team:</strong> {prediction.predictedTeam ?? "-"}</p>
            <p><strong>Predicted Deal:</strong> {prediction.predictedYears ?? "?"} yr / ${prediction.predictedAav ?? 0}M AAV</p>
            <p><strong>Confidence:</strong> {prediction.confidence}/5</p>
            {prediction.notes ? <p>{prediction.notes}</p> : null}
          </div>
        ) : (
          <p>No prediction yet.</p>
        )}

        <h2>Rumors</h2>
        {rumors && rumors.length > 0 ? (
          <ul className="rumor-list">
            {rumors.map((r) => (
              <li key={r.id}>
                <strong>{r.linkedTeam ?? "-"}</strong>
                <span className="confidence">{"★".repeat(r.confidence)}</span>
                <small>{r.source ?? "-"} — {r.datePosted ?? "-"}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No rumors tracked yet.</p>
        )}
      </main>
    </div>
  );
}
