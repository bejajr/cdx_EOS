# Personal Work Wiki AI Assistant Plan

## 1. Product Concept

Build a local web application for macOS that helps manage help requests from clients and coworkers. Each request becomes a structured job workspace with markdown wiki files, reminders, tasks, notes, decisions, and an AI chatbot that can reason over the current job plus similar past jobs.

The goal is personal efficiency, not monetization. The app should reduce friction around intake, documentation, follow-up, and repeatable work processes.

Working name: **Jimmy**

The app should open directly to Jimmy, a chat-first assistant interface. Job wikis, reminders, and documentation pages remain available, but the primary interaction model is asking Jimmy what to do, referencing pages, and eventually using slash commands for fast actions. Jimmy is the single assistant surface; there should not be a separate job-level wiki chatbot.

## 2. Primary User

The primary user is the owner of the app: one person receiving requests from clients and coworkers.

Typical request examples:

- "Can you help me document this process?"
- "Can you look into this issue?"
- "Can you remind me to follow up next week?"
- "Can you help organize this work into next steps?"
- "Can you create a summary from these notes?"

## 3. Core Outcomes

The app should help the user:

- Capture requests quickly.
- Convert messy requests into structured job wikis.
- Generate and maintain markdown documentation.
- Chat with the current job wiki.
- Search and reuse knowledge from past jobs.
- Track simple in-app reminders.
- Track tasks, decisions, and follow-ups.
- Build repeatable workflows over time.

Future safety-manager expansion is tracked in `docs/safety-manager-assistant-roadmap.md`. That roadmap covers email drafting, Excel/PDF generation, OSHA and safety documentation references, product briefs, inspections, incident summaries, and documentation-to-wiki workflows.

## 4. Local-First Direction

The prototype should run locally on macOS.

Recommended architecture:

- Node.js backend
- Local web frontend
- SQLite local database
- Markdown files on disk
- OpenAI API for AI features

The app should not require deployment for the prototype.

## 5. Data Ownership Model

Use a hybrid data model:

- **Markdown files** are the human-readable source of job knowledge.
- **SQLite** stores structured app data, reminders, indexing metadata, chat history, and workflow events.

This keeps the system portable and inspectable while still enabling a fast web interface.

## 6. Job Folder Structure

Each request creates a job folder.

Example:

```text
work-wiki-data/
  jobs/
    2026-05-12-client-name-request-title/
      program.md
      overview.md
      intake.md
      tasks.md
      reminders.md
      notes.md
      decisions.md
      workflow.md
      research.md
      final-summary.md
      attachments/
```

### File Purposes

`program.md`
: Operating instructions for the AI assistant for this job.

`overview.md`
: Human-readable summary of the request, requester, status, and desired outcome.

`intake.md`
: Structured intake answers and missing information.

`tasks.md`
: Action items and completion status.

`reminders.md`
: Reminder details in markdown form.

`notes.md`
: Running notes, observations, pasted context, and working thoughts.

`decisions.md`
: Important decisions, rationale, and dates.

`workflow.md`
: Steps followed for this job and reusable process notes.

`research.md`
: Investigation notes, references, and discovered context.

`final-summary.md`
: Completion summary, outcome, lessons learned, and reusable patterns.

## 7. Karpathy Autoresearch-Inspired Pattern

Karpathy's `autoresearch` pattern uses markdown as the program for an AI loop. For this app, adapt that idea by giving every job a `program.md` file that tells the AI how to work with the job.

The AI should read:

- `program.md`
- current job wiki files
- related reminders/tasks
- relevant past job snippets

Then it should help with:

- answering questions
- generating documentation
- identifying missing information
- proposing next actions
- updating markdown drafts
- finding similar past work

The assistant should not behave like an unconstrained chatbot. It should behave like a job-aware work partner following the current job's operating instructions.

## 8. Default `program.md` Template

```markdown
# Job Program

## Goal

Help complete this client or coworker request efficiently while preserving useful documentation for future reuse.

## Rules

- Preserve known facts exactly.
- Do not invent missing information.
- Mark unknowns as `Unknown`.
- Turn ambiguity into follow-up questions.
- Keep tasks actionable.
- Keep reminders specific and dated when possible.
- Prefer concise markdown.
- When useful, compare this job with similar past jobs.
- Suggest next actions when the job appears blocked.

## Files To Maintain

- overview.md
- intake.md
- tasks.md
- reminders.md
- notes.md
- decisions.md
- workflow.md
- research.md
- final-summary.md

## Done Criteria

- The request is understood.
- Open tasks are tracked.
- Reminders are captured.
- Important decisions are documented.
- The final outcome is summarized.
- Reusable lessons are recorded.
```

## 9. Guided Intake

This feature is currently parked. The original guided intake concept is preserved in `docs/parked-new-request-intake.md`.

When re-enabled, new jobs should be created through a guided intake form.

Fields:

- Request title
- Requester name
- Requester type: client, coworker, other
- Organization or team
- Request summary
- Desired outcome
- Deadline
- Priority
- People involved
- Known constraints
- Related links
- Attachments
- Immediate next action
- Reminder date
- Notes

After submission, the system should:

1. Create a job row in SQLite.
2. Create a job folder.
3. Generate starter markdown files.
4. Generate a first task list.
5. Generate any reminder records.
6. Open the job page.

## 10. Main Screens

### Jimmy Home

Purpose: make the assistant the first screen and primary control surface.

Includes:

- Main Jimmy chat
- Slash command entry
- Plain-language requests that map to the same workflows as slash commands
- Recent/open jobs in the sidebar
- Today's reminders
- Quick action to create a request
- Ability to reference jobs and wiki pages from conversation
- Ability to preserve the active job context when asking Jimmy from a job page

Early slash commands:

- `/jobs` lists current jobs
- `/reminders` lists pending reminders
- `/help` shows available commands

Parked command:

- `/new` creates a new request

Future slash commands:

- `/open [job]`
- `/summarize [job]`
- `/draft [file]`
- `/remind [date] [thing]`
- `/search [query]`
- `/workflow [job]`

Interaction rule:

- Every major action should work through both a slash command and a plain-language request.
- Slash commands should be fast shortcuts for known workflows.
- Plain language should infer the same workflow, ask for missing fields, and show drafts before high-impact actions.

### Operations Dashboard

Purpose: show what needs attention now.

Includes:

- Open jobs
- Due reminders
- Overdue reminders
- Recently updated jobs
- Jobs waiting on someone
- Quick create request button

### Request Intake

Purpose: create a new structured job from a messy request.

Includes:

- Guided form
- Paste raw request box
- AI "structure this request" action
- Create job button

### Job Detail

Purpose: manage one request.

Includes:

- Status
- Requester
- Priority
- Due date
- Next action
- Tasks
- Reminders
- Wiki file list
- Markdown editor
- AI chat panel

### Wiki Search

Purpose: find past knowledge.

Includes:

- Search across jobs
- Filter by requester, status, date, priority
- Similar jobs for current request

### Reminders

Purpose: manage simple in-app reminders.

Includes:

- Today
- Upcoming
- Overdue
- Completed

## 11. AI Features

Use the OpenAI API from the Node.js backend.

Initial AI features:

- Structure a raw request into intake fields.
- Generate starter wiki files.
- Chat with the selected job wiki.
- Summarize notes.
- Extract tasks from notes.
- Extract reminders from notes.
- Draft documentation from notes.
- Find similar past jobs.
- Suggest next actions.
- Generate final summary.

Recommended implementation approach:

- Start with explicit context assembly from local markdown files.
- Add embeddings/vector search later for better past-job retrieval.
- Keep all writes reviewable before saving.

## 12. AI Safety And Control Rules

The assistant should:

- Never silently overwrite markdown files.
- Show proposed edits before applying them.
- Distinguish facts from assumptions.
- Ask follow-up questions when information is missing.
- Keep citations to source files where possible.
- Store chat history locally.
- Avoid sending unnecessary files to the API.

## 13. SQLite Prototype Schema

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  organization TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  requester_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT,
  folder_path TEXT NOT NULL,
  summary TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (requester_id) REFERENCES people(id)
);

CREATE TABLE wiki_files (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  purpose TEXT,
  content_hash TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  job_id INTEGER,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  job_id INTEGER,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE workflow_events (
  id INTEGER PRIMARY KEY,
  job_id INTEGER,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

## 14. Folder Structuring Prompt

Use this prompt when importing an existing folder into the system.

```text
You are organizing a local work folder into a structured job wiki.

Analyze the folder contents and infer:
1. The job or request this folder represents
2. The requester/client/coworker involved
3. The desired outcome
4. Important dates, deadlines, or reminders
5. Open tasks
6. Decisions already made
7. Missing information
8. Files that should become markdown wiki pages
9. Files that should remain attachments
10. Similar patterns or reusable workflow steps

Create the following markdown files:
- overview.md
- intake.md
- tasks.md
- reminders.md
- notes.md
- decisions.md
- workflow.md
- research.md
- final-summary.md

Preserve original facts. Do not invent missing information. Mark unknowns as `Unknown` and create follow-up questions.

Return:
1. A JSON summary suitable for inserting into SQLite
2. Proposed markdown file contents
3. A list of original files that should remain as attachments
4. A list of follow-up questions for the user
```

## 15. Node.js Prototype Stack

Recommended stack:

- Runtime: Node.js
- Backend: Express or Fastify
- Frontend: React with Vite
- Database: SQLite
- SQLite library: better-sqlite3 or sqlite
- Markdown editing: textarea first, richer editor later
- AI provider: OpenAI API
- Styling: simple CSS or Tailwind if preferred

For speed, a single Node.js app with a React frontend and API routes is enough.

## 16. Prototype Roadmap

### Phase 1: Local Skeleton

- Create Node.js project.
- Add SQLite database.
- Add schema migration.
- Create local data folder.
- Build dashboard shell.

### Phase 2: Job Intake

- Add people table usage.
- Create guided intake form.
- Create job folders.
- Generate starter markdown files.
- Show job list.

### Phase 3: Job Wiki

- Add job detail page.
- Add wiki file browser.
- Add markdown editor.
- Save file edits.
- Track wiki file metadata.

### Phase 4: Reminders And Tasks

- Add task list.
- Add reminder list.
- Add dashboard reminders.
- Add simple status updates.

### Phase 5: AI Chat

- Add OpenAI API configuration.
- Build context assembler for current job.
- Add chat panel.
- Store chat messages.
- Add "summarize notes" and "extract tasks" actions.

### Phase 6: Past Job Learning

- Search across markdown files.
- Retrieve similar jobs.
- Add past-job context to chat.
- Later: add embeddings/vector search.

### Phase 7: Email Intake

- Keep this out of the first prototype.
- Later options:
  - manual email paste
  - Gmail API integration
  - IMAP ingestion
  - rules for converting emails into job requests

## 17. Open Questions

- What should the app be named?
- Should the local data folder live inside the repo or in a separate user folder?
- Should AI-generated markdown changes be applied automatically or always reviewed first?
- Should reminders be date-only or date-plus-time?
- Should job statuses be simple or workflow-specific?

Recommended defaults:

- Data folder: `./work-wiki-data` for prototype
- AI edits: review before apply
- Reminders: date-plus-time optional
- Statuses: `open`, `waiting`, `blocked`, `done`, `archived`
