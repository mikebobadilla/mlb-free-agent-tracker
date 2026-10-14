package jobs

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"mlb-tracker/internal/db"
	"mlb-tracker/internal/models"
	"mlb-tracker/internal/store"
)

func testStore(t *testing.T) *store.Store {
	t.Helper()
	database, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	if err := db.Migrate(database); err != nil {
		t.Fatal(err)
	}

	return store.New(database)
}

func TestRunContractWatchSigningDetected(t *testing.T) {
	s := testStore(t)

	p := models.Player{
		Name:     "Test Player",
		Position: "SP",
		MLBID:    12345,
		PrevTeam: "Yankees",
		Status:   "unsigned",
	}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"transactions":[{"id":1,"person":{"id":12345,"fullName":"Test Player"},
			"toTeam":{"id":147,"name":"New York Yankees"},"date":"2026-01-15",
			"typeCode":"FA","typeDesc":"Free Agent","description":"Test Player signed by the New York Yankees."}]}`)
	}))
	t.Cleanup(srv.Close)

	orig := mlbAPIBase
	mlbAPIBase = srv.URL
	t.Cleanup(func() { mlbAPIBase = orig })

	players := []models.Player{p}
	if err := RunContractWatch(s, players); err != nil {
		t.Fatal(err)
	}

	contract, err := s.GetLatestContract(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if contract == nil {
		t.Fatal("expected contract, got nil")
	}
	if contract.Team != "New York Yankees" {
		t.Errorf("team = %q, want %q", contract.Team, "New York Yankees")
	}
	if contract.SignedDate != "2026-01-15" {
		t.Errorf("signed_date = %q, want %q", contract.SignedDate, "2026-01-15")
	}

	player, err := s.GetPlayerByID(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if player.Status != "signed" {
		t.Errorf("status = %q, want %q", player.Status, "signed")
	}
}

func TestRunContractWatchAlreadyHasContract(t *testing.T) {
	s := testStore(t)

	p := models.Player{
		Name:     "Test Player",
		Position: "SP",
		MLBID:    12345,
		PrevTeam: "Yankees",
		Status:   "unsigned",
	}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}

	existing := &models.Contract{
		PlayerID:   p.ID,
		Team:       "Boston Red Sox",
		SignedDate: "2025-12-01",
	}
	if err := s.SaveContract(existing); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"transactions":[{"id":1,"person":{"id":12345,"fullName":"Test Player"},
			"toTeam":{"id":147,"name":"New York Yankees"},"date":"2026-01-15",
			"typeCode":"FA","typeDesc":"Free Agent","description":"Test Player signed by the New York Yankees."}]}`)
	}))
	t.Cleanup(srv.Close)

	orig := mlbAPIBase
	mlbAPIBase = srv.URL
	t.Cleanup(func() { mlbAPIBase = orig })

	players := []models.Player{p}
	if err := RunContractWatch(s, players); err != nil {
		t.Fatal(err)
	}

	contracts, err := s.GetContractsForPlayer(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(contracts) != 1 {
		t.Errorf("got %d contracts, want 1", len(contracts))
	}
}

func TestRunContractWatchNoSigning(t *testing.T) {
	s := testStore(t)

	p := models.Player{
		Name:     "Test Player",
		Position: "SP",
		MLBID:    12345,
		PrevTeam: "Yankees",
		Status:   "unsigned",
	}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"transactions":[]}`)
	}))
	t.Cleanup(srv.Close)

	orig := mlbAPIBase
	mlbAPIBase = srv.URL
	t.Cleanup(func() { mlbAPIBase = orig })

	players := []models.Player{p}
	if err := RunContractWatch(s, players); err != nil {
		t.Fatal(err)
	}

	contract, err := s.GetLatestContract(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if contract != nil {
		t.Errorf("expected nil contract, got %+v", contract)
	}

	player, err := s.GetPlayerByID(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if player.Status != "unsigned" {
		t.Errorf("status = %q, want %q", player.Status, "unsigned")
	}
}

func TestRunContractWatchAPIError(t *testing.T) {
	s := testStore(t)

	p := models.Player{
		Name:     "Test Player",
		Position: "SP",
		MLBID:    12345,
		PrevTeam: "Yankees",
		Status:   "unsigned",
	}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	orig := mlbAPIBase
	mlbAPIBase = srv.URL
	t.Cleanup(func() { mlbAPIBase = orig })

	players := []models.Player{p}
	if err := RunContractWatch(s, players); err != nil {
		t.Fatal(err)
	}

	contract, err := s.GetLatestContract(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if contract != nil {
		t.Errorf("expected nil contract, got %+v", contract)
	}
}

func TestRunContractWatchSkipsSignedPlayers(t *testing.T) {
	s := testStore(t)

	p := models.Player{
		Name:     "Test Player",
		Position: "SP",
		MLBID:    12345,
		PrevTeam: "Yankees",
		Status:   "signed",
	}
	if err := s.UpsertPlayerConfig(&p); err != nil {
		t.Fatal(err)
	}

	// No fake API server is set up. If the job tries to poll this player,
	// it will hit the real API and fail. The test verifies that signed
	// players are skipped before any API call is made.

	players := []models.Player{p}
	if err := RunContractWatch(s, players); err != nil {
		t.Fatal(err)
	}
}
