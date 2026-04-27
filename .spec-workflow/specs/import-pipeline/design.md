# Import Pipeline Design

## Data Models

### ImportBatch

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| status | enum | queued/preparing/extracting/classifying/processing/indexing/completed/partial_success/failed/cancelled |
| sourceType | string | User-initiated |
| totalFiles | number | Total files in batch |
| processedFiles | number | Files processed so far |
| successFiles | number | Successfully processed |
| failedFiles | number | Failed files |
| currentStage | string | Current pipeline stage |
| createdAt | timestamp | Creation time |
| startedAt | timestamp | When processing started |
| completedAt | timestamp | Completion time |

### ImportFileTask

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID |
| batchId | string | Parent batch ID |
| originalPath | string | Original file path |
| normalizedPath | string | Working copy path |
| fileType | string | pdf/png/jpg/etc |
| status | enum | queued/extracting/text_extracting/ocr_running/parsing/matching_candidate/saving/done/failed/skipped |
| stage | string | Current stage name |
| errorCode | string | Error code if failed |
| errorMessage | string | Error message if failed |
| candidateId | string | Matched candidate ID |
| resultJson | object | Parsed result data |

## Pipeline Stages

```
Creating batch
  → Scanning input
  → If ZIP: Extract PDF entries
  → Classify & filter
  → PDF text extraction
  → Structured parsing
  → Candidate matching or creation
  → Save files & results
  → Update search index
  → Complete or enter AI screening queue
```

## Detailed Stage Rules

### preparing

- Receive file path list
- Calculate batch count
- Create batch record
- Validate path accessibility

### extracting

- Extract ZIP to temp working directory
- Allow recursive extraction with maxDepth=3
- Skip hidden/system files
- Default: maxDepth=3, maxEntriesPerArchive=500

### classifying

- Classify by extension and MIME
- Files outside whitelist marked as skipped
- Log skip reason

### text_extracting

**PDF:**
- Try direct text extraction first
- If text is insufficient, mark for manual review or reject by quality gate

**非 PDF:**
- Reject image and unsupported archive inputs with clear validation messages

### ocr_running (legacy)

- 保留给历史任务状态兼容；新的导入流程不再进入 OCR 阶段

### parsing

Extract:
- Name, Phone, Email, Position, Years of experience
- Skills keywords, Education, Work history, Projects

Note: Parsing failure ≠ file failure. Original text is always preserved.

### matching_candidate

Order:
1. Phone exact match
2. Email exact match
3. Create new candidate

Weak matches (e.g., name + position) only prompt, don't auto-merge.

### saving

- Save original file
- Save extracted text
- Save parsed result JSON
- Associate resume with candidate
- Update candidate summary fields

### indexing

- Write full text to FTS index
- Refresh candidate search summary

## Error Codes

| Code | Description |
|------|-------------|
| IMPORT_FILE_NOT_FOUND | Source file not found |
| IMPORT_UNSUPPORTED_TYPE | File type not supported |
| IMPORT_ARCHIVE_TOO_DEEP | ZIP nesting exceeds maxDepth |
| IMPORT_ARCHIVE_TOO_LARGE | ZIP exceeds size limit |
| IMPORT_TEXT_EXTRACT_FAILED | Text extraction failed |
| IMPORT_OCR_FAILED | OCR recognition failed |
| IMPORT_PARSE_FAILED | Structured parsing failed |
| IMPORT_SAVE_FAILED | File save failed |
| IMPORT_INDEX_FAILED | Search index update failed |

## Concurrency

| Stage | Suggested Concurrency |
|-------|---------------------|
| Text extraction | 2-4 |
| Structured parsing | 2-4 |
| AI screening | 1-2 |
| Export/share | Serial |

## UI Display

### Batch Card

- Total file count
- Success count
- Failed count
- Current stage
- Overall percentage
- Current file being processed

### File Detail

- Filename
- File type
- Current stage
- Status
- Failure reason
- Retry button

## Implementation Location

```
packages/server/src/services/import/
├── types.ts      # Data types
├── extractor.ts  # PDF text extraction
├── parser.ts    # Structured parsing
├── pipeline.ts  # Pipeline orchestration
└── index.ts     # Service entry
```
