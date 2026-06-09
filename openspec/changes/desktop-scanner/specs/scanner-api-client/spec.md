## ADDED Requirements

### Requirement: Authentication
The Scanner API client SHALL authenticate independently with the API Server using email/password.

#### Scenario: Login flow
- **WHEN** `mce-scanner login` is invoked with email and password
- **THEN** it SHALL call `POST /v1/auth/register` or `POST /v1/auth/login`, receive `access_token` and `refresh_token`, and persist them to `~/.mce-scanner/auth.json`

#### Scenario: Token refresh
- **WHEN** an API call returns HTTP 401
- **THEN** the client SHALL attempt to refresh using the stored `refresh_token`; if refresh succeeds, retry the original request with the new token

#### Scenario: Refresh token expired
- **WHEN** the refresh token is also expired (refresh returns 401)
- **THEN** the client SHALL log an error message instructing the user to run `mce-scanner login` and persist all pending payloads to the watermark DB

#### Scenario: No auth configured
- **WHEN** Scanner runs but `~/.mce-scanner/auth.json` does not exist
- **THEN** it SHALL exit with an error message: "Not authenticated. Run 'mce-scanner login' first."

### Requirement: Capture upload
The Scanner API client SHALL upload Captures via `POST /v1/captures` with the authenticated user's token.

#### Scenario: Successful upload
- **WHEN** the API returns HTTP 201 (created) or HTTP 200 (already exists)
- **THEN** the client SHALL return success with the capture ID

#### Scenario: Upload payload format
- **WHEN** uploading a Capture
- **THEN** the request body SHALL match the `CaptureCreateRequest` schema: `{source, content, extraction_quality, hashes, metadata}`

#### Scenario: Idempotent upload
- **WHEN** the same content_hash is uploaded twice for the same user
- **THEN** the API Server SHALL return HTTP 200 with the existing capture ID (no duplicate created)

### Requirement: Retry logic
The API client SHALL retry failed uploads up to 3 times before persisting locally.

#### Scenario: Transient failure with retry
- **WHEN** an upload fails with HTTP 5xx or network error
- **THEN** the client SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s)

#### Scenario: Permanent failure
- **WHEN** an upload fails with HTTP 4xx (except 401)
- **THEN** the client SHALL NOT retry and SHALL log the error with the response body

#### Scenario: All retries exhausted
- **WHEN** 3 retries fail for a 5xx/network error
- **THEN** the client SHALL return failure, and the Scanner SHALL persist the payload to the watermark DB's `pending_uploads` table

### Requirement: API base URL configuration
The API client SHALL read the API Server base URL from configuration.

#### Scenario: Default URL
- **WHEN** no `api_base_url` is configured in `~/.mce-scanner/config.json`
- **THEN** the client SHALL use the default URL (same as extension's default)

#### Scenario: Custom URL
- **WHEN** `api_base_url` is set in `~/.mce-scanner/config.json`
- **THEN** the client SHALL use that URL for all API calls
