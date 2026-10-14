package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// addedColumns are players columns added after the original schema. New
// databases get them from schema.sql; Migrate adds them to older databases.
var addedColumns = []struct{ name, sqlType string }{
	{"season", "INTEGER"},
	{"obp", "REAL"},
	{"slg", "REAL"},
	{"ops", "REAL"},
	{"whip", "REAL"},
	{"ip", "REAL"},
	{"k9", "REAL"},
	{"fip", "REAL"},
	{"contract_expiry", "INTEGER"},
}

func Open(dbPath string) (*sql.DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

func Migrate(db *sql.DB) error {
	if _, err := db.Exec(schema); err != nil {
		return err
	}

	existing, err := playerColumns(db)
	if err != nil {
		return err
	}
	for _, col := range addedColumns {
		if existing[col.name] {
			continue
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE players ADD COLUMN %s %s", col.name, col.sqlType)); err != nil {
			return fmt.Errorf("adding column %s: %w", col.name, err)
		}
	}

	// Older versions of the sync and server startup wrote a blank status.
	_, err = db.Exec(`UPDATE players SET status = 'unsigned' WHERE status IS NULL OR status = ''`)
	return err
}

func playerColumns(db *sql.DB) (map[string]bool, error) {
	rows, err := db.Query("SELECT name FROM pragma_table_info('players')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		cols[name] = true
	}
	return cols, rows.Err()
}
