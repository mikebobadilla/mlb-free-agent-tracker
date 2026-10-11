package store

import (
	"path/filepath"
	"testing"

	"mlb-tracker/internal/db"
	"mlb-tracker/internal/models"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}
	return New(database)
}

func TestUpsertPlayerRoundTrip(t *testing.T) {
	s := newTestStore(t)
	era := 3.2
	in := models.Player{Name: "Corbin Burnes", Position: "SP", MLBID: 669203, PrevTeam: "Orioles",
		Age: 31, ERA: &era, Season: 2026, Status: "unsigned"}
	if err := s.UpsertPlayer(&in); err != nil {
		t.Fatal(err)
	}

	got, err := s.GetPlayerByMLBID(669203)
	if err != nil {
		t.Fatal(err)
	}
	if got.Age != 31 || got.Season != 2026 || got.ERA == nil || *got.ERA != 3.2 {
		t.Errorf("got age=%d season=%d era=%v", got.Age, got.Season, got.ERA)
	}
}

func TestUpsertPlayerNoStats(t *testing.T) {
	s := newTestStore(t)
	in := models.Player{Name: "Juan Soto", Position: "OF", MLBID: 665742, Status: "unsigned"}
	if err := s.UpsertPlayer(&in); err != nil {
		t.Fatal(err)
	}

	players, err := s.GetAllPlayers()
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 1 {
		t.Fatalf("got %d players, want 1", len(players))
	}
	if p := players[0]; p.ERA != nil || p.Season != 0 {
		t.Errorf("got era=%v season=%d, want nil and 0", p.ERA, p.Season)
	}
}
