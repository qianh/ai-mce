# capture-discovery Specification

## Purpose
Defines how the options page lists, filters, labels, and opens Captures, including local-only versus cloud-backed state and cloud detail retrieval.
## Requirements
### Requirement: Capture 本地/云端状态展示
The Captures list and detail views SHALL show whether each Capture is local-only or cloud-backed.

#### Scenario: 本地数据显示上传操作
- **WHEN** a Capture has no cloud Capture ID
- **AND** the user has a valid cloud session
- **THEN** the row or detail view shows an upload-to-cloud action

#### Scenario: 云端数据不显示重复上传操作
- **WHEN** a Capture is cloud-backed
- **THEN** the row or detail view shows cloud state
- **AND** it does not show upload-to-cloud as the primary action

### Requirement: 云端数据详情按需读取
If a cloud-backed Capture does not keep full local source text after successful upload, the detail page SHALL load full messages from the API server.

#### Scenario: 云端详情读取原文
- **WHEN** a user opens a cloud-backed Capture whose local source text is absent
- **THEN** the options page fetches the detail from `GET /v1/captures/{id}`
- **AND** displays full messages and extraction metadata
