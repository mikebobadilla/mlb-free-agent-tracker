import type { PlayerDashboard } from "../models";

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export function fetchPlayers(): Promise<PlayerDashboard[]> {
  return request("/api/players");
}

export function fetchPlayer(mlbId: number): Promise<PlayerDashboard> {
  return request(`/api/players/${mlbId}`);
}
