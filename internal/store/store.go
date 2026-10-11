package store

import (
	"database/sql"
	"mlb-tracker/internal/models"
)

type Store struct {
	db *sql.DB
}

func New(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) UpsertPlayer(p *models.Player) error {
	_, err := s.db.Exec(`
		INSERT INTO players (mlb_id, name, position, age, prev_team, war, era, season, status, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(mlb_id) DO UPDATE SET
			name = excluded.name,
			position = excluded.position,
			age = excluded.age,
			prev_team = excluded.prev_team,
			war = excluded.war,
			era = excluded.era,
			season = excluded.season,
			status = excluded.status,
			updated_at = excluded.updated_at
	`, p.MLBID, p.Name, p.Position, p.Age, p.PrevTeam, p.WAR, p.ERA, nullIfZero(p.Season), p.Status)
	return err
}

// playerColumns and scanPlayer must stay in the same order.
const playerColumns = `id, mlb_id, name, position, age, prev_team, war, era, season, status, updated_at`

type scanner interface {
	Scan(dest ...any) error
}

func scanPlayer(row scanner) (*models.Player, error) {
	var p models.Player
	var age, season sql.NullInt64
	var war, era sql.NullFloat64
	var prevTeam, status sql.NullString
	if err := row.Scan(&p.ID, &p.MLBID, &p.Name, &p.Position, &age, &prevTeam, &war, &era, &season, &status, &p.UpdatedAt); err != nil {
		return nil, err
	}
	p.Age = int(age.Int64)
	p.PrevTeam = prevTeam.String
	p.WAR = war.Float64
	p.ERA = floatPtr(era)
	p.Season = int(season.Int64)
	p.Status = status.String
	return &p, nil
}

func floatPtr(f sql.NullFloat64) *float64 {
	if !f.Valid {
		return nil
	}
	return &f.Float64
}

func nullIfZero(n int) sql.NullInt64 {
	return sql.NullInt64{Int64: int64(n), Valid: n != 0}
}

func (s *Store) GetAllPlayers() ([]models.Player, error) {
	rows, err := s.db.Query(`SELECT ` + playerColumns + ` FROM players ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var players []models.Player
	for rows.Next() {
		p, err := scanPlayer(rows)
		if err != nil {
			return nil, err
		}
		players = append(players, *p)
	}
	return players, rows.Err()
}

func (s *Store) GetPlayerByID(id int64) (*models.Player, error) {
	return scanPlayer(s.db.QueryRow(`SELECT `+playerColumns+` FROM players WHERE id = ?`, id))
}

func (s *Store) GetPlayerByMLBID(mlbID int64) (*models.Player, error) {
	return scanPlayer(s.db.QueryRow(`SELECT `+playerColumns+` FROM players WHERE mlb_id = ?`, mlbID))
}

func (s *Store) GetContractsForPlayer(playerID int64) ([]models.Contract, error) {
	rows, err := s.db.Query(`
		SELECT id, player_id, team, years, total_value, aav, signed_date, created_at
		FROM contracts WHERE player_id = ? ORDER BY created_at DESC
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contracts []models.Contract
	for rows.Next() {
		var c models.Contract
		if err := rows.Scan(&c.ID, &c.PlayerID, &c.Team, &c.Years, &c.TotalValue, &c.AAV, &c.SignedDate, &c.CreatedAt); err != nil {
			return nil, err
		}
		contracts = append(contracts, c)
	}
	return contracts, nil
}

func (s *Store) GetLatestContract(playerID int64) (*models.Contract, error) {
	var c models.Contract
	err := s.db.QueryRow(`
		SELECT id, player_id, team, years, total_value, aav, signed_date, created_at
		FROM contracts WHERE player_id = ? ORDER BY created_at DESC LIMIT 1
	`, playerID).Scan(&c.ID, &c.PlayerID, &c.Team, &c.Years, &c.TotalValue, &c.AAV, &c.SignedDate, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) GetRumorsForPlayer(playerID int64) ([]models.Rumor, error) {
	rows, err := s.db.Query(`
		SELECT id, player_id, linked_team, source, confidence, date_posted, created_at
		FROM rumors WHERE player_id = ? ORDER BY created_at DESC
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rumors []models.Rumor
	for rows.Next() {
		var r models.Rumor
		if err := rows.Scan(&r.ID, &r.PlayerID, &r.LinkedTeam, &r.Source, &r.Confidence, &r.DatePosted, &r.CreatedAt); err != nil {
			return nil, err
		}
		rumors = append(rumors, r)
	}
	return rumors, nil
}

func (s *Store) GetPredictionForPlayer(playerID int64) (*models.Prediction, error) {
	var pred models.Prediction
	err := s.db.QueryRow(`
		SELECT id, player_id, predicted_team, predicted_years, predicted_aav, confidence, notes, created_at
		FROM predictions WHERE player_id = ? ORDER BY created_at DESC LIMIT 1
	`, playerID).Scan(&pred.ID, &pred.PlayerID, &pred.PredictedTeam, &pred.PredictedYears, &pred.PredictedAAV, &pred.Confidence, &pred.Notes, &pred.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pred, nil
}

func (s *Store) GetDashboardData() ([]models.PlayerDashboard, error) {
	players, err := s.GetAllPlayers()
	if err != nil {
		return nil, err
	}

	var result []models.PlayerDashboard
	for _, p := range players {
		dash := models.PlayerDashboard{Player: p}

		contract, err := s.GetLatestContract(p.ID)
		if err != nil {
			return nil, err
		}
		dash.Contract = contract

		rumors, err := s.GetRumorsForPlayer(p.ID)
		if err != nil {
			return nil, err
		}
		dash.Rumors = rumors

		pred, err := s.GetPredictionForPlayer(p.ID)
		if err != nil {
			return nil, err
		}
		dash.Prediction = pred

		result = append(result, dash)
	}
	return result, nil
}

func (s *Store) SaveContract(c *models.Contract) error {
	_, err := s.db.Exec(`
		INSERT INTO contracts (player_id, team, years, total_value, aav, signed_date)
		VALUES (?, ?, ?, ?, ?, ?)
	`, c.PlayerID, c.Team, c.Years, c.TotalValue, c.AAV, c.SignedDate)
	return err
}

func (s *Store) SaveRumor(r *models.Rumor) error {
	_, err := s.db.Exec(`
		INSERT INTO rumors (player_id, linked_team, source, confidence, date_posted)
		VALUES (?, ?, ?, ?, ?)
	`, r.PlayerID, r.LinkedTeam, r.Source, r.Confidence, r.DatePosted)
	return err
}

func (s *Store) SavePrediction(p *models.Prediction) error {
	_, err := s.db.Exec(`
		INSERT INTO predictions (player_id, predicted_team, predicted_years, predicted_aav, confidence, notes)
		VALUES (?, ?, ?, ?, ?, ?)
	`, p.PlayerID, p.PredictedTeam, p.PredictedYears, p.PredictedAAV, p.Confidence, p.Notes)
	return err
}

func (s *Store) UpdatePlayerStatus(playerID int64, status string) error {
	_, err := s.db.Exec(`UPDATE players SET status = ? WHERE id = ?`, status, playerID)
	return err
}
