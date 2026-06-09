## ADDED Requirements

### Requirement: Watermark database initialization
The Scanner SHALL create and manage a SQLite database at `~/.mce-scanner/state.db` for tracking processed sessions.

#### Scenario: First run
- **WHEN** Scanner runs for the first time and `~/.mce-scanner/state.db` does not exist
- **THEN** it SHALL create the directory and database with the required schema (sessions + pending_uploads tables)

#### Scenario: Existing database
- **WHEN** Scanner runs and `state.db` already exists
- **THEN** it SHALL open it and continue without re-creating tables

### Requirement: Session tracking
The watermark database SHALL track each processed session by file path and content hash.

#### Scenario: New session detected
- **WHEN** a session file_path is not in the `sessions` table
- **THEN** Scanner SHALL treat it as new and process it

#### Scenario: Session content unchanged
- **WHEN** a session file_path exists in `sessions` with the same content_hash
- **THEN** Scanner SHALL skip it

#### Scenario: Session content changed
- **WHEN** a session file_path exists in `sessions` but with a different content_hash
- **THEN** Scanner SHALL re-parse and re-upload it, then update the content_hash in the watermark

### Requirement: Failed upload persistence
The watermark database SHALL store failed upload payloads for later retry.

#### Scenario: Upload fails after 3 retries
- **WHEN** an upload fails 3 times
- **THEN** Scanner SHALL insert the serialized payload into `pending_uploads` with `retry_count = 3` and `last_error` set to the error message

#### Scenario: Retry pending uploads
- **WHEN** Scanner starts a new scan cycle
- **THEN** it SHALL first attempt to upload any payloads in `pending_uploads`, removing successfully uploaded entries

#### Scenario: Pending upload succeeds on retry
- **WHEN** a pending_upload entry is successfully uploaded
- **THEN** Scanner SHALL delete it from `pending_uploads` and insert/update the corresponding entry in `sessions`

### Requirement: Watermark database integrity
The watermark database SHALL use transactions to prevent partial state corruption.

#### Scenario: Crash during upload tracking
- **WHEN** Scanner crashes between uploading and updating the watermark
- **THEN** on next run, the session will appear as not-yet-uploaded, causing a re-upload that the API Server's content_hash idempotency will deduplicate
