# Import Pipeline Requirements

## Alignment with Product Vision

导入流水线支持批量导入 zip/pdf，形成可观察、可重试、可恢复的本地处理流程，是候选人数据入口。

## Requirements

### Requirement 1: 支持格式

**User Story:** As a user, I want to import resumes in common formats, so that I can easily add candidates to the system.

#### Acceptance Criteria

1. WHEN user imports files THEN the system SHALL support zip and pdf formats
2. WHEN an unsupported format is encountered THEN the system SHALL skip the file with warning
3. WHEN a zip is imported THEN the system SHALL extract PDF files contained in the archive

### Requirement 2: 流水线阶段

**User Story:** As a system, I want to process imports through well-defined stages, so that progress is trackable and failures are isolated.

#### Acceptance Criteria

1. WHEN an import batch starts THEN it SHALL transition through: queued → preparing → extracting → classifying → text_extracting → parsing → matching_candidate → saving → indexing → completed
2. WHEN a file fails at any stage THEN the batch SHALL continue processing other files
3. WHEN a file completes its stage THEN it SHALL transition to the next stage atomically

### Requirement 3: PDF 文本提取

**User Story:** As a user, I want the system to extract text directly from searchable PDFs, so that I can search and parse resume content reliably.

#### Acceptance Criteria

1. WHEN a PDF is imported THEN the system SHALL extract embedded text directly
2. WHEN an image file or unsupported archive is imported THEN the system SHALL reject it with a clear validation message
3. WHEN text extraction completes THEN the extracted text SHALL be saved for parsing

### Requirement 4: 候选人归并

**User Story:** As a system, I want to match imported resumes to existing candidates when possible, so that duplicate records are minimized.

#### Acceptance Criteria

1. WHEN parsing completes THEN the system SHALL attempt matching by phone number (exact)
2. WHEN phone match fails THEN the system SHALL try email matching
3. WHEN no match found THEN the system SHALL create a new candidate
4. WHEN partial match found (e.g., same name) THEN the system SHALL flag for user review

### Requirement 5: 进度与观察

**User Story:** As a user, I want to see import progress, so that I know how long to wait and what's happening.

#### Acceptance Criteria

1. WHEN a batch is running THEN the UI SHALL show overall progress percentage
2. WHEN a file fails THEN the UI SHALL show the error and allow retry
3. WHEN batch completes THEN a notification SHALL be created
4. WHEN batch has failures THEN the user SHALL be able to retry failed files individually or all at once

### Requirement 6: 取消与恢复

**User Story:** As a user, I want to cancel ongoing imports and resume later, so that I'm in control.

#### Acceptance Criteria

1. WHEN user cancels a batch THEN no new file tasks SHALL start
2. WHEN user requests recovery after app restart THEN the system SHALL restore batch state from database
3. WHEN user retries failed files THEN the system SHALL start from the failed stage

## Non-Functional Requirements

### Performance

- Concurrent text extraction/parsing: 2-4 workers
- UI never blocked by import processing
- Batch creation responds immediately

### Code Architecture

- Pipeline logic isolated in `packages/server/src/services/import/`
- Batch and FileTask are separate entities with clear state machines
- Stage transitions are atomic and logged

### Reliability

- App restart preserves task state
- File-level failure isolation
- Clear error codes for each failure type
