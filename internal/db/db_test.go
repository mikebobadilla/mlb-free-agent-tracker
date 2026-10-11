package db

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestMigrateFreshDB(t *testing.T) {
	db := openTestDB(t)
	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	// Running twice must be safe (server and sync both migrate on start).
	if err := Migrate(db); err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
	cols, err := playerColumns(db)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range addedColumns {
		if !cols[c.name] {
			t.Errorf("missing column %s", c.name)
		}
	}
}

func TestMigrateAddsColumnsToOldDB(t *testing.T) {
	db := openTestDB(t)
	// The original players table, before any added columns.
	_, err := db.Exec(`CREATE TABLE players (
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
	INSERT INTO players (mlb_id, name, position) VALUES (1, 'Old Player', 'SP');`)
	if err != nil {
		t.Fatal(err)
	}

	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}

	var name string
	var season sql.NullInt64
	if err := db.QueryRow("SELECT name, season FROM players WHERE mlb_id = 1").Scan(&name, &season); err != nil {
		t.Fatal(err)
	}
	if name != "Old Player" || season.Valid {
		t.Errorf("got name=%q season=%v, want existing row kept with NULL season", name, season)
	}
}
