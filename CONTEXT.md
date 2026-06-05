# AI Memory Capture

AI Memory Capture turns user-selected AI web conversations into reusable personal memory. This glossary fixes product language for local storage, cloud storage, and user-controlled sync.

## Language

**Capture**:
A saved AI conversation or selected web content created by an explicit user action. In cloud storage it includes the full source messages plus extraction metadata.
_Avoid_: Message, record, item

**Local Data**:
A Capture whose source payload is stored only in the extension's local OPFS SQLite database and has not been uploaded to the cloud service.
_Avoid_: Offline data, unsynced message

**Local Mode**:
The default storage mode where Captures are saved and viewed only in the extension's local SQLite database. It requires no registration, sends no cloud request, and must keep working without the API Server.
_Avoid_: Personal version, offline mode

**Cloud Data**:
A Capture stored in the cloud service under a registered user's account and isolated from other users.
_Avoid_: Remote message, server data

**Cloud Mode**:
The storage mode where new Captures are uploaded to the cloud service after registration or login. After upload succeeds, the extension keeps only lightweight local metadata and the cloud Capture ID, not the full source payload.
_Avoid_: Sync mode, online mode

**Cloud Link**:
The local metadata that connects a Capture shown in the extension to its cloud Capture ID. A Cloud Link is not a full local copy of the source payload.
_Avoid_: Local duplicate, mirrored record

**Manual Backfill**:
A user-initiated upload of an existing Local Data Capture to the cloud. Enabling cloud mode does not automatically backfill historical local Captures.
_Avoid_: Auto migration, automatic sync

**Delete Capture**:
The user action that removes a Capture from every place where this product stores it. If a Capture has a cloud copy, deletion removes both the cloud record and the local metadata or local copy.
_Avoid_: Delete local only, detach cloud copy

**Upload Fallback**:
The Cloud Mode failure behavior where an upload failure saves the Capture as Local Data. The user can later use the same upload-to-cloud action to manually sync it.
_Avoid_: Automatic retry queue, background sync

**Sensitive Upload Confirmation**:
An explicit confirmation shown before uploading a Capture whose content matches local sensitive-content detection. It applies to Cloud Mode saves and Manual Backfill.
_Avoid_: Silent upload, warning-only upload

**Registered User**:
A person who has created an account with the cloud service using email and password in the first cloud release. OAuth and PKCE are future login options, not required for the first cloud release.
_Avoid_: OAuth user, account holder

**API Server**:
A Python cloud service that receives Captures, stores them per Registered User, and is expected to run AI analysis jobs in later releases.
_Avoid_: Extension backend, Bun server

**Cloud Database**:
The server-side Supabase/Postgres database behind the API Server. Future migrations to other databases are handled when needed, not abstracted in the first cloud release.
_Avoid_: Local SQLite, OPFS database

## Example Dialogue

Dev: "If a user switches to cloud mode, do we upload their old Captures?"
Domain: "No. Old Captures remain Local Data until the user clicks upload for that specific Capture."

Dev: "How does the options page show this?"
Domain: "Each Capture shows whether it is Cloud Data. If it is still Local Data, show an upload-to-cloud action."

Dev: "In Cloud Mode, do we keep the full text locally after upload?"
Domain: "No. Keep metadata and the cloud Capture ID locally; the full payload lives in the cloud after successful upload."

Dev: "What happens if cloud upload fails?"
Domain: "Save it as Local Data and let the user manually upload it later from the options page."

Dev: "If a Capture has been uploaded, does delete only remove the local row?"
Domain: "No. Delete removes the cloud record and the local metadata or local copy together."

Dev: "Does Local Mode need the API Server?"
Domain: "No. Local Mode is the default and must keep saving and viewing Captures without registration or network access."

Dev: "Does cloud mode require OAuth?"
Domain: "Not in the first cloud release. A Registered User signs up with email and password through the API server."

Dev: "Why is the API Server Python?"
Domain: "Because later releases need server-side AI analysis, so the service should be built in a Python ecosystem from the start."

Dev: "Do we need database portability in the first cloud release?"
Domain: "No. Use Supabase/Postgres directly; handle migrations to another database later if the need becomes real."
