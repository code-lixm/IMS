# Local AI Workbench Requirements

## Introduction

Local AI Workbench (LUI) 是面试管理系统的 AI 对话工作台，为候选人评估提供 AI 辅助能力。不同于最初嵌入 OpenCode 的方案，LUI 采用自建架构，使用 Vercel AI SDK + ai-elements-vue 构建。

## Alignment with Product Vision

IMS 系统的核心价值在于提升候选人管理效率。LUI 作为 AI 工作台，为面试官提供：
- 候选人上下文感知的 AI 对话
- 简历/面试记录 AI 分析
- AI 辅助的候选人评估

## Requirements

### Requirement 1: 三栏布局界面

**User Story:** As a user, I want a three-column layout so that I can manage conversations, view messages, and handle file resources simultaneously.

#### Acceptance Criteria

1. WHEN the user opens `/lui` THEN the system SHALL display three columns: session list (left), chat area (center), file resources (right)
2. WHEN the window is resized THEN the three columns SHALL maintain their proportions
3. WHEN the user clicks on a conversation THEN the system SHALL display that conversation's messages in the center column
4. WHEN the user hovers over file resources THEN the system SHALL highlight the resource

### Requirement 2: 会话管理

**User Story:** As a user, I want to create, switch, and delete conversations so that I can organize my work by topic or candidate.

#### Acceptance Criteria

1. WHEN the user clicks "New Conversation" THEN the system SHALL create a new conversation with a default title
2. WHEN the user clicks on a conversation THEN the system SHALL switch to that conversation and load its messages
3. WHEN the user clicks delete on a conversation THEN the system SHALL remove that conversation after confirmation
4. WHEN the user switches conversations THEN the file resources SHALL remain unchanged
5. WHEN there are no conversations THEN the system SHALL display an empty state with a prompt to create one

### Requirement 3: 消息发送与渲染

**User Story:** As a user, I want to send messages and receive AI responses so that I can interact with the AI assistant.

#### Acceptance Criteria

1. WHEN the user types a message and clicks send THEN the system SHALL send the message to the AI backend
2. WHEN the user presses Enter (without Shift) THEN the system SHALL send the message
3. WHEN the user presses Shift+Enter THEN the system SHALL insert a newline
4. WHEN the AI is generating a response THEN the system SHALL display streaming text
5. WHEN the AI response contains Markdown THEN the system SHALL render it properly (bold, italic, code blocks, lists)
6. WHEN the AI response contains reasoning THEN the system SHALL display a collapsible reasoning section
7. WHEN the AI response contains tool calls THEN the system SHALL display them in a structured format

### Requirement 4: Slash Command

**User Story:** As a user, I want to use slash commands so that I can quickly access specific features.

#### Acceptance Criteria

1. WHEN the user types `/` THEN the system SHALL display a dropdown menu with available commands
2. WHEN the user types more characters THEN the system SHALL filter commands that match the input
3. WHEN the user selects a command THEN the system SHALL insert it into the input field
4. WHEN the user presses Escape THEN the system SHALL close the dropdown

### Requirement 5: 文件上传

**User Story:** As a user, I want to upload files so that I can attach documents to my conversations.

#### Acceptance Criteria

1. WHEN the user clicks the upload button THEN the system SHALL open a file picker dialog
2. WHEN the user selects a file THEN the system SHALL add it to the file resources
3. WHEN the file is an image THEN the system SHALL display a thumbnail preview
4. WHEN the file is too large (>10MB) THEN the system SHALL display an error message
5. WHEN the upload is in progress THEN the system SHALL display a progress indicator

### Requirement 6: 文件资源管理

**User Story:** As a user, I want to manage file resources so that I can organize and reference files in my conversations.

#### Acceptance Criteria

1. WHEN the user uploads a file THEN the system SHALL add it to the file resources panel
2. WHEN the user clicks on a file THEN the system SHALL display a preview dialog
3. WHEN the user clicks download on a file THEN the system SHALL download the file to the user's device
4. WHEN the user clicks delete on a file THEN the system SHALL remove it from the resources
5. WHEN there are no files THEN the system SHALL display an empty state

### Requirement 7: AI 流式响应

**User Story:** As a user, I want to receive AI responses in real-time so that I don't have to wait for the complete response.

#### Acceptance Criteria

1. WHEN the user sends a message THEN the system SHALL connect to the AI backend via streaming
2. WHEN the AI sends a chunk THEN the system SHALL append it to the message
3. WHEN the streaming completes THEN the system SHALL mark the message as complete
4. WHEN an error occurs THEN the system SHALL display an error message and allow retry

### Requirement 8: 会话持久化

**User Story:** As a user, I want my conversations to persist so that I can continue where I left off.

#### Acceptance Criteria

1. WHEN the user creates a conversation THEN the system SHALL save it to the database
2. WHEN the user switches conversations THEN the system SHALL load the conversation's messages from the database
3. WHEN the user sends a message THEN the system SHALL save it to the database
4. WHEN the user reloads the page THEN the system SHALL restore the last active conversation

## Non-Functional Requirements

### Performance

- Message rendering SHALL maintain 60fps during streaming
- File preview SHALL load within 500ms for files under 1MB
- Conversation switching SHALL complete within 200ms

### Code Architecture

- Frontend components isolated in `apps/web/src/components/lui/`
- Backend API routes in `packages/server/src/routes/`
- Shared types in `packages/shared/src/`
- Pinia store for client state management

### Security

- All API endpoints require authentication
- File uploads are validated for type and size
- No sensitive data logged to console

### Reliability

- Failed message sends can be retried
- File upload failures show clear error messages
- Network errors trigger appropriate user feedback
