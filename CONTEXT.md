# AI Memory Capture

AI Memory Capture collects personal AI conversations from all channels — browser and desktop — into reusable personal memory. This glossary fixes product language for capture channels, local storage, cloud storage, and user-controlled sync.

## Language

**Capture**:
A saved AI conversation or selected web content. Browser-channel Captures require explicit user action; desktop-channel Captures are collected automatically by the Scanner. In cloud storage a Capture includes the full source messages plus extraction metadata.
_Avoid_: Message, record, item

**Browser Channel**:
The capture channel that runs as a Chrome Extension on supported AI web pages. Every Browser Channel Capture requires an explicit user action and a preview confirmation before saving.
_Avoid_: Web mode, plugin channel

**Desktop Channel**:
The capture channel that runs as a macOS launchd daemon, scanning local AI CLI tool session files. Desktop Channel Captures are collected and uploaded automatically without user confirmation.
_Avoid_: CLI mode, terminal channel

**Scanner**:
A Go binary running as a macOS launchd daemon that watches AI CLI tool session directories, parses completed sessions into Captures, and uploads them to the API Server. It maintains its own authentication and a local watermark database for incremental processing.
_Avoid_: Watcher, collector, agent

**Parser**:
A Scanner component that reads one specific AI CLI tool's session format and converts it into the standard Capture payload. Each supported tool (Claude Code, Codex, Grok, OpenCode) has its own Parser.
_Avoid_: Extractor (reserved for browser-channel content scripts), adapter

**Watermark Database**:
The Scanner's local SQLite database that tracks which sessions have been processed, keyed by file path and content hash. Stored at a Scanner-owned path, separate from any AI tool's data directory.
_Avoid_: State file, checkpoint

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

**Completed Session**:
An AI CLI tool session whose files have not been modified for at least 10 minutes. Only Completed Sessions are eligible for Scanner collection. A session still being written to is ignored until it becomes a Completed Session.
_Avoid_: Closed session, finished session

**Digest（消化）**:
The realtime profile-analysis stage that processes one Capture end to end: cleaning, splitting into Task Segments, and distilling Memory Atoms. Digest output waits in pending state until the next Dream Cycle. Digest is incremental: a re-uploaded Capture is diffed by message hashes, and append-only changes digest only the new message range.
_Avoid_: Preprocessing, ETL

**Dream Cycle（做梦）**:
The daily batch stage that reconciles pending Memory Atoms against existing Profile Claims and produces a new Profile Snapshot and User Brief. Each affected claim gets exactly one of five outcomes: unchanged, strengthened, weakened, contradicted, deprecated.
_Avoid_: Sync job, merge task

**Task Segment（任务段）**:
A contiguous message range within one Capture that pursues a single task goal. The basic unit of analysis; one Capture may contain several Task Segments.
_Avoid_: Chapter, fragment

**Memory Atom（记忆原子）**:
The smallest evidence-backed fact distilled from a Task Segment, typed as fact, preference, skill signal, project context, or behavior pattern. Carries a confidence score and Evidence pointing to its source messages.
_Avoid_: Memory, note

**Distiller（蒸馏）**:
The pipeline component that uses an LLM to distill Memory Atoms from a Task Segment.
_Avoid_: Extractor (reserved for browser-channel content scripts)

**Profile Claim（画像断言）**:
A user-level conclusion aggregated from Memory Atoms, owned by exactly one of the seven profile dimensions. Carries confidence, a status machine, and an Evidence chain. Claims describe observable behavior patterns only — never psychological, personality, or ability judgments.
_Avoid_: Tag, profile item

**Evidence（证据）**:
The traceable link from a Memory Atom or Profile Claim back to its source: a Capture plus message range. Has active/superseded status; superseded Evidence weakens or deprecates the claims it supports during the next Dream Cycle.
_Avoid_: Reference, source

**Profile Snapshot（画像快照）**:
The versioned archive of the full profile state produced at the end of each Dream Cycle, with an explanation of what changed and why.
_Avoid_: Backup

**User Brief（用户简报）**:
The compact profile summary compiled from high-confidence Profile Claims for AI CLI consumption via MCP. Rebuilt after every Dream Cycle.
_Avoid_: Profile report

**Calibration（校准）**:
A user action through the MCP tools that confirms, rejects, or corrects a Profile Claim. Confirmed claims are pinned at high confidence; rejected claims are permanently deprecated and never revived by later Dream Cycles.
_Avoid_: Feedback, rating

**Analysis Run（消化记录）**:
The execution record of one Digest, keyed by an idempotency key (capture id + content hash + pipeline version) and storing the message-hash watermark used for incremental diffing. Prevents duplicate digestion.
_Avoid_: Log

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

Dev: "Does the Scanner auto-upload like the browser extension?"
Domain: "Yes. Desktop Channel Captures are fully automatic — the Scanner collects and uploads without user confirmation. Browser Channel Captures still require explicit user action."

Dev: "How does the Scanner know which sessions to collect?"
Domain: "It watches AI CLI tool directories via launchd WatchPaths. When files change, it checks for Completed Sessions — those not modified for 10 minutes. It tracks progress in its Watermark Database using file path and content hash."

Dev: "What if upload fails?"
Domain: "The Scanner retries 3 times. If still failing, the Capture payload is saved in the Watermark Database for later retry."

Dev: "How do I tell browser Captures from desktop Captures?"
Domain: "By source_url. Browser Captures have a real URL. Desktop Captures have the fixed value 'desktop'. The platform field identifies the AI product in both channels."

Dev: "Does the Scanner share login with the extension?"
Domain: "No. The Scanner authenticates independently with its own credentials. Both authenticate as the same Registered User, so all Captures land under one account."
