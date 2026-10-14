package models

import "time"

type Player struct {
	ID       int64  `yaml:"-"`
	Name     string `yaml:"name"`
	Position string `yaml:"position"`
	MLBID    int64  `yaml:"mlb_id"`
	PrevTeam string `yaml:"prev_team"`

	// Synced fields
	Age            int     `yaml:"-"`
	Status         string  `yaml:"-"` // unsigned | negotiating | signed
	Season         int     `yaml:"-"` // season the stats are from; 0 if none
	ContractExpiry int     `yaml:"-"` // year the contract expires; 0 if unknown
	WAR            float64 `yaml:"-"`

	// Hitting; nil when not set
	OBP *float64 `yaml:"-"`
	SLG *float64 `yaml:"-"`
	OPS *float64 `yaml:"-"`

	// Pitching; nil when not set. IP is in baseball notation (42.2 = 42 2/3).
	ERA  *float64 `yaml:"-"`
	WHIP *float64 `yaml:"-"`
	IP   *float64 `yaml:"-"`
	K9   *float64 `yaml:"-"`
	FIP  *float64 `yaml:"-"`

	UpdatedAt time.Time `yaml:"-"`
}

type Contract struct {
	ID         int64     `yaml:"-"`
	PlayerID   int64     `yaml:"-"`
	Team       string    `yaml:"-"`
	Years      int       `yaml:"-"`
	TotalValue float64   `yaml:"-"` // millions
	AAV        float64   `yaml:"-"` // millions
	SignedDate string    `yaml:"-"`
	CreatedAt  time.Time `yaml:"-"`
}

type Rumor struct {
	ID         int64     `yaml:"-"`
	PlayerID   int64     `yaml:"-"`
	LinkedTeam string    `yaml:"-"`
	Source     string    `yaml:"-"`
	Confidence int       `yaml:"-"` // 1-5
	DatePosted string    `yaml:"-"`
	CreatedAt  time.Time `yaml:"-"`
}

type Prediction struct {
	ID             int64     `yaml:"-"`
	PlayerID       int64     `yaml:"-"`
	PredictedTeam  string    `yaml:"-"`
	PredictedYears int       `yaml:"-"`
	PredictedAAV   float64   `yaml:"-"`
	Confidence     int       `yaml:"-"`
	Notes          string    `yaml:"-"`
	CreatedAt      time.Time `yaml:"-"`
}

type PlayerDashboard struct {
	Player     Player
	Contract   *Contract
	Rumors     []Rumor
	Prediction *Prediction
}
