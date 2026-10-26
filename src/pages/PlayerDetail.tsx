import { useEffect, useState } from "react";
import { fetchPlayer } from "../api/client";

export function PlayerDetail({ mlbId, onBack }: { mlbId: number; onBack: () => void }) {
  const [data, setData] = useState<{ player: unknown; contract: unknown; rumors: unknown[]; prediction: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlayer(mlbId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [mlbId]);

  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>Loading...</div>;

  const player = data.player as { name: string; position: string; status: string; contractExpiry: number | null; team?: string };
  const contract = data.contract as { team: string; years: number | null } | null;

  return (
    <div>
      <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>&larr; Back</a>
      <h1>{player.name}</h1>
      <p>{player.position} | Status: {player.status}</p>
      {player.contractExpiry ? <p>Contract Expires: {player.contractExpiry}</p> : null}
      {contract ? <p>Contract: {contract.team} ({contract.years ?? "?"} yrs)</p> : null}
    </div>
  );
}
