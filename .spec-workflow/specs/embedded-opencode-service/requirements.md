# Embedded OpenCode Service Requirements

## Alignment with Product Vision

内置 OpenCode 服务将 opencode-ai 封装进客户端内部，由本地 Bun 服务统一启动与管理，为每位候选人提供独立 AI workspace。

## Requirements

### Requirement 1: 客户端内置打包

**User Story:** As a user, I want OpenCode bundled with the app, so that I don't need to install anything extra.

#### Acceptance Criteria

1. WHEN the app is installed THEN OpenCode SHALL be included in the application bundle
2. WHEN the app starts THEN OpenCode SHALL NOT require internet download
3. WHEN the app runs THEN OpenCode SHALL NOT depend on global PATH or installation

### Requirement 2: 进程生命周期管理

**User Story:** As a system, I want to manage OpenCode's lifecycle, so that it's available when needed and doesn't waste resources.

#### Acceptance Criteria

1. WHEN user enters candidate AI workspace THEN the system SHALL check if OpenCode is running
2. WHEN OpenCode is not running THEN the system SHALL start it automatically
3. WHEN OpenCode crashes THEN the system SHALL attempt automatic restart
4. WHEN the app closes THEN the system SHALL cleanly shutdown OpenCode

### Requirement 3: 候选人 Workspace 隔离

**User Story:** As a user, I want each candidate to have an isolated AI workspace, so that context doesn't leak between candidates.

#### Acceptance Criteria

1. WHEN entering a candidate workspace THEN a unique OpenCode session SHALL be created
2. WHEN re-entering the same candidate THEN the existing session SHALL be reused
3. WHEN different candidates are used THEN their sessions SHALL be completely isolated

### Requirement 4: 上下文注入

**User Story:** As a system, I want to inject candidate context into the AI workspace, so that the AI has relevant information.

#### Acceptance Criteria

1. WHEN a workspace is created THEN the system SHALL inject candidate info (name, position, skills)
2. WHEN relevant THEN the system SHALL inject resume text summary
3. WHEN interview history exists THEN the system SHALL inject past evaluations summary
4. WHEN existing artifacts exist THEN the system SHALL inject artifact summaries

### Requirement 5: 端口与网络隔离

**User Story:** As a security measure, I want OpenCode to only listen locally, so that it's not accessible from the network.

#### Acceptance Criteria

1. WHEN OpenCode starts THEN it SHALL only listen on 127.0.0.1
2. WHEN OpenCode is running THEN no remote connections SHALL be possible
3. WHEN a port conflict occurs THEN the system SHALL try next available port

### Requirement 6: 健康检查与监控

**User Story:** As an operator, I want to monitor OpenCode health, so that I can diagnose issues.

#### Acceptance Criteria

1. WHEN OpenCode starts THEN startup time SHALL be logged
2. WHEN health check fails THEN failure count SHALL be incremented
3. WHEN consecutive restarts fail THEN status SHALL be marked as degraded
4. WHEN session creation fails THEN failure SHALL be logged with candidate ID

## Non-Functional Requirements

### Performance

- OpenCode starts on-demand, not perpetually running
- Health check responds within 1 second
- Session creation responds within 5 seconds

### Code Architecture

- OpenCode manager isolated in `packages/server/src/services/opencode-manager.ts`
- Candidate ↔ Session mapping stored in database
- Process lifecycle handled by Bun subprocess APIs

### Reliability

- Automatic restart on crash
- Status tracking in database
- Clear degraded mode when unrecoverable

### Security

- No token exposure to OpenCode pages
- Candidate data controlled by Bun service, not OpenCode directly
