CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mlb_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    age INTEGER,
    prev_team TEXT,
    war REAL,
    era REAL,
    status TEXT DEFAULT 'unsigned',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    team TEXT NOT NULL,
    years INTEGER,
    total_value REAL,
    aav REAL,
    signed_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rumors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    linked_team TEXT,
    source TEXT,
    confidence INTEGER DEFAULT 3,
    date_posted TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    predicted_team TEXT,
    predicted_years INTEGER,
    predicted_aav REAL,
    confidence INTEGER DEFAULT 3,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_rumors_player ON rumors(player_id);
CREATE INDEX IF NOT EXISTS idx_contracts_player ON contracts(player_id);
CREATE INDEX IF NOT EXISTS idx_predictions_player ON predictions(player_id);
