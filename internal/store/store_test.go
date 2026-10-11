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
		Age: 31, ERA: &era, Season: 2026}
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
	in := models.Player{Name: "Juan Soto", Position: "OF", MLBID: 665742}
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

func TestRestartKeepsSyncedDataAndStatus(t *testing.T) {
	s := newTestStore(t)
	era := 3.2
	synced := models.Player{Name: "Corbin Burnes", Position: "SP", MLBID: 669203, PrevTeam: "Orioles",
		Age: 31, ERA: &era, Season: 2026}
	if err := s.UpsertPlayer(&synced); err != nil {
		t.Fatal(err)
	}
	p, err := s.GetPlayerByMLBID(669203)
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != "unsigned" {
		t.Errorf("new player status = %q, want unsigned", p.Status)
	}
	if err := s.UpdatePlayerStatus(p.ID, "signed"); err != nil {
		t.Fatal(err)
	}

	// Server restart: config players have no stats or status.
	fromYAML := models.Player{Name: "Corbin Burnes", Position: "SP", MLBID: 669203, PrevTeam: "Orioles"}
	if err := s.UpsertPlayerConfig(&fromYAML); err != nil {
		t.Fatal(err)
	}
	// Next sync: also carries no status.
	if err := s.UpsertPlayer(&synced); err != nil {
		t.Fatal(err)
	}

	got, err := s.GetPlayerByMLBID(669203)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "signed" {
		t.Errorf("status = %q, want signed", got.Status)
	}
	if got.Age != 31 || got.Season != 2026 || got.ERA == nil {
		t.Errorf("synced data lost: age=%d season=%d era=%v", got.Age, got.Season, got.ERA)
	}
}

func TestUpsertPlayerConfigAddsNewPlayer(t *testing.T) {
	s := newTestStore(t)
	p := models.Player{Name: "Max Fried", Position: "SP", MLBID: 608337, PrevTeam: "Braves"}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetPlayerByMLBID(608337)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Max Fried" || got.Status != "unsigned" || got.ERA != nil {
		t.Errorf("got %+v", got)
	}
}
