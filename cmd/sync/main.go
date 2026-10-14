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
	if err := jobs.RunContractWatch(s, cfg.Players); err != nil {
		log.Fatalf("Contract watch failed: %v", err)
	}

	log.Println("Sync complete")
}
