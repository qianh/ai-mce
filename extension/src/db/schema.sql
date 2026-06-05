PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL DEFAULT '',
  extraction_quality TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  storage_state TEXT NOT NULL DEFAULT 'local',
  cloud_capture_id TEXT,
  cloud_uploaded_at TEXT,
  upload_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  normalized_text TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_captures_fingerprint ON captures(source_fingerprint) WHERE source_fingerprint != '';
CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
