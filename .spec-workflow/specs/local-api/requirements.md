# Local API Requirements

## Alignment with Product Vision

Local API 是客户端内部统一业务 API，前端只访问本地服务，本地服务负责数据库、远程系统、文件、任务与 OpenCode 服务协同。

## Requirements

### Requirement 1: 统一响应格式

**User Story:** As a frontend developer, I want a consistent API response format, so that error handling and data parsing is uniform across all endpoints.

#### Acceptance Criteria

1. WHEN any API endpoint responds THEN it SHALL return `{ success: boolean, data: any, error: any, meta: { requestId, timestamp } }`
2. WHEN an error occurs THEN the response SHALL include error.code and error.message
3. WHEN validation fails THEN the response SHALL return HTTP 422 with details

### Requirement 2: 认证与 Token 管理

**User Story:** As a user, I want secure token storage and automatic re-authentication prompts, so that my session is secure yet convenient.

#### Acceptance Criteria

1. WHEN user initiates login THEN the system SHALL open company login page
2. WHEN login completes THEN the token SHALL be stored in OS Keyring (never plaintext)
3. WHEN token expires THEN the UI SHALL show prominent re-authentication prompt
4. WHEN user re-authenticates THEN the current context SHALL be preserved

### Requirement 3: 候选人 CRUD

**User Story:** As a user, I want to manage candidates (create, read, update, delete), so that I can maintain my candidate pool.

#### Acceptance Criteria

1. WHEN a user views the candidate list THEN the system SHALL show remote + local + hybrid candidates
2. WHEN searching candidates THEN the system SHALL support fuzzy search on name/position/phone/email
3. WHEN filtering candidates THEN the system SHALL support source/status/position/hasAiArtifacts
4. WHEN creating a local candidate THEN the system SHALL assign a UUID and source="local"

### Requirement 4: 简历与面试记录

**User Story:** As a user, I want to attach resumes and interview records to candidates, so that I have complete candidate information.

#### Acceptance Criteria

1. WHEN viewing a candidate THEN the system SHALL return all associated resumes and interviews
2. WHEN downloading a resume THEN the system SHALL serve the original file with proper content-disposition
3. WHEN creating an interview record THEN the system SHALL support round/scheduledAt/meetingLink/interviewers

### Requirement 5: AI 工作台

**User Story:** As a user, I want AI-powered candidate workspaces, so that I can get screening, questions, and evaluations generated.

#### Acceptance Criteria

1. WHEN entering candidate AI workspace THEN the system SHALL create or reuse an OpenCode session
2. WHEN requesting an artifact THEN the system SHALL track versions and feedback
3. WHEN submitting feedback THEN the system SHALL trigger new artifact generation
4. WHEN downloading an artifact THEN the system SHALL support md/pdf formats

### Requirement 6: 共享接口

**User Story:** As a user, I want to share candidate profiles with colleagues via LAN or export, so that collaboration is seamless.

#### Acceptance Criteria

1. WHEN discovering LAN devices THEN the system SHALL broadcast user identity and show online devices
2. WHEN exporting a candidate THEN the system SHALL generate a valid .imr package
3. WHEN importing an .imr THEN the system SHALL validate and merge according to conflict rules
4. WHEN a share transfer completes THEN both parties SHALL see confirmation

### Requirement 7: 通知与状态

**User Story:** As a user, I want to see system status and notifications, so that I'm always informed about important events.

#### Acceptance Criteria

1. WHEN system status changes THEN the indicator SHALL reflect current state (gray/green/yellow/red)
2. WHEN background tasks complete THEN a notification SHALL be created
3. WHEN user clicks notification THEN the relevant context SHALL open

### Requirement 8: OpenCode 服务管理

**User Story:** As a system, I want to manage the embedded OpenCode service lifecycle, so that it's always available when needed.

#### Acceptance Criteria

1. WHEN client starts THEN OpenCode service status SHALL be queryable
2. WHEN OpenCode is not running THEN start SHALL be available
3. WHEN OpenCode crashes THEN the system SHALL attempt automatic restart
4. WHEN OpenCode is upgrading THEN degraded status SHALL be shown

## Non-Functional Requirements

### Performance

- Search response < 500ms
- List supports 1000+ candidates
- Import processing uses queue concurrency

### Security

- OpenCode service only listens on 127.0.0.1
- Tokens never exposed to frontend
- File downloads require authorization

### Code Architecture

- API routes organized by domain (auth, candidates, import, share, opencode, system)
- Shared response format utility
- Error codes centralized
