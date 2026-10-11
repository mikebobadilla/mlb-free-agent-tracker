package main

import (
	"fmt"
	"html/template"
	"log"
	"mlb-tracker/internal/db"
	"mlb-tracker/internal/handlers"
	"mlb-tracker/internal/jobs"
	"mlb-tracker/internal/store"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"mlb-tracker/internal/models"
)

var funcMap = template.FuncMap{
	"repeat": func(s string, count int) string {
		return strings.Repeat(s, count)
	},
	"stat": formatStat,
}

// formatStat formats a nullable stat, or returns "-" when it isn't set.
func formatStat(format string, v *float64) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprintf(format, *v)
}

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
	// Open database
	dbPath := filepath.Join("data", "tracker.db")
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.Migrate(database); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Load curated player list
	cfg, err := loadConfig("config/players.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize store and add any new players from the config. Synced
	// stats and status are left alone; the background sync fills them in.
	s := store.New(database)
	for _, p := range cfg.Players {
		if err := s.UpsertPlayerConfig(&p); err != nil {
			log.Printf("Failed to upsert player %s: %v", p.Name, err)
		}
	}

	// Parse templates
	tmpl := template.Must(template.New("").Funcs(funcMap).ParseGlob("web/templates/*.html"))

	// Setup handlers
	h := handlers.New(s, tmpl)

	// Start background sync
	jobs.StartBackgroundSync(s, cfg.Players)

	// Setup routes
	mux := http.NewServeMux()
	mux.HandleFunc("/", h.Dashboard)
	mux.HandleFunc("/players/", h.PlayerDetail)
	mux.HandleFunc("/api/players", h.APIPlayers)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := host + ":" + port
	log.Printf("Server starting on %s", addr)
	log.Printf("Tracking %d players", len(cfg.Players))
	log.Fatal(http.ListenAndServe(addr, mux))
}
