package watermark

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	db *sql.DB
	mu sync.Mutex
}

type PendingUpload struct {
	ID        int64
	FilePath  string
	Payload   string
	RetryCount int
	CreatedAt string
	LastError string
}

type Stats struct {
	TrackedSessions int
	SkippedSessions int
	PendingRetries  int
	LastScanAt      string
}

func Open(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	// busy_timeout retries on SQLITE_BUSY; WAL allows concurrent readers across processes.
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			file_path    TEXT PRIMARY KEY,
			content_hash TEXT NOT NULL,
			platform     TEXT NOT NULL,
			session_id   TEXT,
			uploaded_at  TEXT,
			status       TEXT NOT NULL DEFAULT 'uploaded'
		);
		CREATE TABLE IF NOT EXISTS pending_uploads (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			file_path    TEXT NOT NULL,
			payload      TEXT NOT NULL,
			retry_count  INTEGER NOT NULL DEFAULT 0,
			created_at   TEXT NOT NULL,
			last_error   TEXT
		);
		DELETE FROM pending_uploads WHERE id NOT IN (
			SELECT MAX(id) FROM pending_uploads GROUP BY file_path
		);
		CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_file_path ON pending_uploads(file_path);
	`); err != nil {
		db.Close()
		return nil, err
	}

	return &DB{db: db}, nil
}

func (d *DB) Close() error {
	return d.db.Close()
}

func (d *DB) IsProcessed(filePath, contentHash string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	var count int
	err := d.db.QueryRow(
		`SELECT COUNT(*) FROM sessions WHERE file_path = ? AND content_hash = ?`,
		filePath, contentHash,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (d *DB) MarkUploaded(filePath, contentHash, platform, sessionID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(`
		INSERT INTO sessions (file_path, content_hash, platform, session_id, uploaded_at, status)
		VALUES (?, ?, ?, ?, ?, 'uploaded')
		ON CONFLICT(file_path) DO UPDATE SET
			content_hash = excluded.content_hash,
			platform = excluded.platform,
			session_id = excluded.session_id,
			uploaded_at = excluded.uploaded_at,
			status = 'uploaded'
	`, filePath, contentHash, platform, sessionID, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return err
	}
	// A watermarked session needs no retry: drop any stale pending row.
	_, err = d.db.Exec(`DELETE FROM pending_uploads WHERE file_path = ?`, filePath)
	return err
}

func (d *DB) SavePending(filePath, payload, lastError string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	// One pending row per file: repeated failures keep only the latest payload/error.
	_, err := d.db.Exec(`
		INSERT INTO pending_uploads (file_path, payload, retry_count, created_at, last_error)
		VALUES (?, ?, 3, ?, ?)
		ON CONFLICT(file_path) DO UPDATE SET
			payload = excluded.payload,
			created_at = excluded.created_at,
			last_error = excluded.last_error
	`, filePath, payload, time.Now().UTC().Format(time.RFC3339), lastError)
	return err
}

func (d *DB) GetPendingUploads() ([]PendingUpload, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	rows, err := d.db.Query(`SELECT id, file_path, payload, retry_count, created_at, last_error FROM pending_uploads`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []PendingUpload
	for rows.Next() {
		var p PendingUpload
		if err := rows.Scan(&p.ID, &p.FilePath, &p.Payload, &p.RetryCount, &p.CreatedAt, &p.LastError); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (d *DB) RemovePending(id int64) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(`DELETE FROM pending_uploads WHERE id = ?`, id)
	return err
}

func (d *DB) Stats() (Stats, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	var s Stats
	if err := d.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE content_hash NOT LIKE 'skipped:%' AND content_hash NOT LIKE 'empty:%'`).Scan(&s.TrackedSessions); err != nil {
		return s, err
	}
	if err := d.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE content_hash LIKE 'skipped:%'`).Scan(&s.SkippedSessions); err != nil {
		return s, err
	}
	if err := d.db.QueryRow(`SELECT COUNT(*) FROM pending_uploads`).Scan(&s.PendingRetries); err != nil {
		return s, err
	}
	return s, nil
}
