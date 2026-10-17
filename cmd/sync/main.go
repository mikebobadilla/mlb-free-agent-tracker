package main

import (
	"log"
	"mlb-tracker/internal/db"
	"mlb-tracker/internal/jobs"
	"mlb-tracker/internal/store"
	"path/filepath"

	"gopkg.in/yaml.v3"
	"os"
	"mlb-tracker/internal/models"
)

type Config struct {
	Players []models.Player `yaml:"players"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func main() {
	dbPath := filepath.Join("data", "tracker.db")
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	cfg, err := loadConfig("config/players.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	s := store.New(database)
	if err := jobs.RunStatsSync(s, cfg.Players); err != nil {
		log.Fatalf("Stats sync failed: %v", err)
	}

	// Set contract expiry for players with expiring contracts.
	// This is a one-time setup step — safe to run on every sync.
	expiryPlayers := map[int64]int{
		670970: 2026, // Adrian Morejon
		650633: 2026, // Michael King
		664034: 2026, // Ty France
	}
	for mlbID, year := range expiryPlayers {
		p, err := s.GetPlayerByMLBID(mlbID)
		if err != nil {
			log.Printf("Failed to get player %d for contract expiry: %v", mlbID, err)
			continue
		}
		if err := s.SetContractExpiry(p.ID, year); err != nil {
			log.Printf("Failed to set contract expiry for %d: %v", mlbID, err)
		}
	}

	log.Println("Sync complete")
}
