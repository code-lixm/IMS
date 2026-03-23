# IMR Format Design

## Overview

IMR (Interview Manager Resume) 是候选人档案的统一打包格式，用于局域网在线共享和离线导出导入。

- 格式名: `IMR` (`Interview Manager Resume`)
- 文件后缀: `.imr`
- 底层容器: `zip`

## Directory Structure

```
candidate-{candidateId}-{timestamp}.imr
├── manifest.json
├── checksums.json
├── candidate.json
├── resumes/
│   ├── resume-1.pdf
│   └── resume-2.png
├── parsed/
│   ├── resume-1.extracted.txt
│   ├── resume-1.parsed.json
│   └── resume-2.ocr.txt
├── interviews/
│   ├── interview-round-1.json
│   └── interview-round-2.json
├── artifacts/
│   ├── screening/
│   │   ├── artifact.json
│   │   ├── v1.md
│   │   └── v2.md
│   ├── questions/
│   │   ├── round-1-v1.md
│   │   └── round-2-v1.md
│   └── evaluations/
│       ├── round-1-v1.md
│       └── round-2-v1.md
└── attachments/
    └── extra-note.txt
```

## Core Files

### manifest.json

```json
{
  "format": "imr",
  "version": "1.0.0",
  "exportedAt": "2026-03-22T12:00:00Z",
  "sourceApp": "interview-manager",
  "sourceVersion": "0.1.0",
  "candidateId": "cand_001",
  "candidateIdentity": {
    "name": "张三",
    "phone": "13800000000",
    "email": "zhangsan@example.com"
  },
  "contains": {
    "resumes": 2,
    "interviews": 2,
    "artifacts": 5,
    "attachments": 1
  },
  "hashAlgorithm": "sha256",
  "encryption": {
    "enabled": false,
    "method": null
  }
}
```

### checksums.json

```json
{
  "candidate.json": "sha256:...",
  "resumes/resume-1.pdf": "sha256:...",
  "parsed/resume-1.parsed.json": "sha256:..."
}
```

### candidate.json

```json
{
  "id": "cand_001",
  "source": "hybrid",
  "remoteId": "remote_123",
  "name": "张三",
  "phone": "13800000000",
  "email": "zhangsan@example.com",
  "position": "前端工程师",
  "yearsOfExperience": 5,
  "tags": ["react", "候选池A"],
  "createdAt": "2026-03-20T10:00:00Z",
  "updatedAt": "2026-03-22T11:00:00Z"
}
```

## Export Rules

1. One `.imr` contains exactly one candidate main archive
2. All referenced files MUST exist in the package
3. Export MUST generate `manifest.json` and `checksums.json`
4. Filename may be desensitized, but `candidate.json` desensitization depends on user settings

## Import Rules

### Validation (MUST pass)

- Container format validation
- `manifest.json` existence
- Version compatibility check
- `checksums.json` verification
- Critical JSON structure validation

### Rejection Conditions

- Package corrupted
- manifest missing
- Critical JSON invalid
- Version completely incompatible
- Checksum mismatch without user override

### Graceful Degradation

- Unrecognized extra fields → ignored
- Partial attachments missing but main archive complete → continue with warning
- Non-critical artifacts missing → continue

## Conflict Merge Rules

### Candidate Identification Order

1. Phone number exact match
2. Email exact match
3. User manually selects existing candidate
4. Create new candidate

### Merge Strategy

| Field | Strategy |
|-------|----------|
| Candidate basic info | Prompt user for confirmation |
| Resume files | Dedupe by hash |
| Interviews | Merge by `remoteId`, add if no match |
| AI artifacts | Keep all versions (append only) |
| Attachments | Dedupe by hash, not filename |

### Import Result States

- `created` - New candidate created
- `merged` - Merged with existing candidate
- `conflict` - Requires user decision
- `failed` - Import failed

## Security & Extension

- v1: No mandatory encryption
- Future: `manifest.encryption` can specify encryption algorithm
- Future: Signature field can verify source client

## Implementation Location

```
packages/server/src/services/imr/
├── types.ts      # IMR type definitions
├── exporter.ts   # Create IMR package
└── importer.ts   # Parse and validate IMR package
```
