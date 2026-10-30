export interface Player {
  id: number;
  mlbId: number;
  name: string;
  position: string;
  age: number | null;
  prevTeam: string | null;
  war: number | null;
  season: number | null;
  status: string;
  contractExpiry: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  era: number | null;
  whip: number | null;
  ip: number | null;
  k9: number | null;
  fip: number | null;
  updatedAt: string;
}

export interface Contract {
  id: number;
  playerId: number;
  team: string;
  years: number | null;
  totalValue: number | null;
  aav: number | null;
  signedDate: string | null; // YYYY-MM-DD
  origin: string; // "curated" (players.yaml) | "transaction" (MLB signing, no terms)
  transactionId: number | null;
  firstSeason: number | null;
  optedOutAfter: number | null;
  notes: string | null;
  source: string | null;
  createdAt: string;
}

export interface Rumor {
  id: number;
  playerId: number;
  linkedTeam: string | null;
  source: string | null;
  confidence: number;
  datePosted: string | null;
  createdAt: string;
}

export interface Prediction {
  id: number;
  playerId: number;
  predictedTeam: string | null;
  predictedYears: number | null;
  predictedAav: number | null;
  confidence: number;
  notes: string | null;
  createdAt: string;
}

export interface PlayerDashboard {
  player: Player;
  contract: Contract | null;
  rumors: Rumor[];
  prediction: Prediction | null;
}
