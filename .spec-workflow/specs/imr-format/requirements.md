# IMR Format Requirements

## Alignment with Product Vision

IMR (Interview Manager Resume) 格式是候选人档案共享的基础设施，支持局域网在线共享和离线导出导入，实现候选人数据的闭环流通。

## Requirements

### Requirement 1: 包格式定义

**User Story:** As a developer, I want a well-defined package format for candidate archives, so that data can be reliably shared between clients.

#### Acceptance Criteria

1. WHEN a candidate archive is exported THEN the system SHALL produce a `.imr` file with zip container
2. WHEN an IMR file is imported THEN the system SHALL verify package integrity using checksums
3. WHEN an IMR file is opened THEN the system SHALL parse `manifest.json` to validate version compatibility

### Requirement 2: 包含内容完整性

**User Story:** As a user, I want the complete candidate profile to be included in an IMR package, so that the recipient has all necessary information.

#### Acceptance Criteria

1. WHEN an IMR is created THEN it SHALL include candidate main info, resumes, interviews, and AI artifacts
2. WHEN an IMR contains multiple resume versions THEN all versions SHALL be preserved with original filenames
3. WHEN an IMR contains AI artifacts THEN each artifact SHALL include all version history

### Requirement 3: 冲突合并规则

**User Story:** As a user, I want intelligent conflict resolution when importing an IMR, so that duplicate candidates are handled gracefully.

#### Acceptance Criteria

1. WHEN an IMR is imported THEN the system SHALL match candidates by phone number first, then email
2. WHEN a phone/email match is found THEN the system SHALL prompt user for merge decision
3. WHEN no match is found THEN the system SHALL create a new candidate
4. WHEN artifact versions conflict THEN the system SHALL preserve all versions (no overwrite)

### Requirement 4: 校验与安全

**User Story:** As a system administrator, I want package validation to prevent corrupted or tampered data, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN an IMR is imported THEN the system SHALL verify all file checksums
2. WHEN checksum verification fails THEN the system SHALL reject the import with clear error
3. WHEN an encrypted IMR is encountered THEN the system SHALL attempt decryption using stored credentials

### Requirement 5: 在线共享集成

**User Story:** As a user, I want to send IMR packages directly to nearby devices on LAN, so that sharing is seamless.

#### Acceptance Criteria

1. WHEN a user initiates LAN share THEN the system SHALL generate a temporary IMR package
2. WHEN the package is transferred THEN it SHALL be processed as standard IMR import on receiver side
3. WHEN the transfer completes THEN both parties SHALL see confirmation

## Non-Functional Requirements

### Code Architecture and Modularity

- IMR package logic SHALL be isolated in `packages/server/src/services/imr/` module
- Exporter and Importer SHALL have clear separation of concerns
- Package format version SHALL be encoded in manifest for forward compatibility

### Performance

- Package creation SHOULD complete within 5 seconds for typical candidate档案 (≤50 files)
- Package validation SHOULD complete within 2 seconds

### Security

- Checksum algorithm: SHA-256
- Encryption field is prepared for future use but not implemented in v1
