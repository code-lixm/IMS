# IMS Chatbot QA Evidence

Date: 2026-03-27 (Asia/Shanghai)

## Static verification

- `pnpm --filter @ims/web typecheck` → passed
- `pnpm --filter @ims/web build` → passed
- `apps/web/src/stores/lui/messages.ts` → `lsp_diagnostics` returned no errors
- `apps/web/src/components/lui/prompt-input.vue` → `lsp_diagnostics` returned no errors
- `apps/web/src/components/ai-elements/model-selector/ModelSelectorContent.vue` → `lsp_diagnostics` returned no errors

## Manual QA

Fresh manual QA was executed against `http://127.0.0.1:5173/lui` using a temporary local mock OpenAI-compatible endpoint.

Observed browser result:

```json
{
  "hasAssistantReply": true,
  "hasModelButton": true,
  "hasUploadedFile": true
}
```

Observed body text excerpt:

```text
IMS AI
已完成

联调成功（mock provider）

e2e-upload.txt
Remove
Agent
openai / mock-chat
文件资源
1 个文件
```

Observed console result:

```text
Total messages: 4 (Errors: 0, Warnings: 0)
```

## Persistence evidence

During QA, the conversations endpoint returned the active conversation with persisted mock model selection:

```json
{
  "id": "conv_fe040dfc-628c-4c44-8e47-2b6d3a96e350",
  "modelProvider": "gateway:mock-local",
  "modelId": "gateway:mock-local::mock-chat"
}
```

The files endpoint returned the uploaded resource during QA:

```json
{
  "name": "e2e-upload.txt",
  "type": "document"
}
```

## Cleanup evidence

After QA, cleanup restored runtime state:

```text
GET /api/lui/settings -> {"customEndpoints":[]}
GET /api/lui/files -> {"items":[]}
GET /api/lui/conversations -> conv_fe040dfc-628c-4c44-8e47-2b6d3a96e350 restored to gateway:deepseek-chat / gateway:deepseek-chat::deepseek-chat
DELETE /api/lui/conversations/conv_test_1774422478660 -> {"id":"conv_test_1774422478660"}
```

Temporary screenshots and temporary QA output files were removed after verification.
