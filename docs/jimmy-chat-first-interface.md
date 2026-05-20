# Jimmy Chat-First Interface

## Purpose

Jimmy is the main entry point for the local work wiki application. When the app opens, the user should land in a chat-first workspace where they can ask questions, reference jobs, create requests, and eventually use slash commands to trigger workflows.

## Current Behavior

- The home page opens to `Chat with Jimmy`.
- The sidebar lists open jobs.
- `New request` is parked for now and preserved in `docs/parked-new-request-intake.md`.
- Each created request still generates a markdown-backed job wiki.
- Jimmy has a global chat history stored in SQLite.
- Jimmy's global chat is also written to `work-wiki-data/jimmy/chat.md`.
- Jimmy is the only AI assistant surface. Job pages no longer have a separate wiki chatbot.
- Job pages include an `Ask Jimmy` action that returns to the main chat while preserving the selected job's wiki context.

## Markdown Creation Rules

The app should create markdown files whenever work becomes durable knowledge.

### Global Jimmy Chat

Global Jimmy conversation should be appended to:

```text
work-wiki-data/jimmy/chat.md
```

This gives the user a readable local record outside the database.

### Job Wikis

Each new request should create:

```text
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
```

These files are the source of truth for job-level context.

## Slash Commands

Current starter commands:

- `/jobs`
- `/reminders`
- `/sources`
- `/wiki-from-doc [file or topic]`
- `/explain [topic]`
- `/help`

Parked command:

- `/new` is parked with the New Request intake flow.

Future commands should create or update markdown when they generate durable outputs.

Examples:

- `/summarize [job]` updates `final-summary.md`
- `/draft [job] [file]` creates or updates a wiki file
- `/workflow [job]` updates `workflow.md`
- `/decision [job] [note]` appends to `decisions.md`
- `/note [job] [note]` appends to `notes.md`

## Slash Commands And Plain Language

Jimmy should support both precise slash commands and natural-language requests for the same actions.

Slash commands are for speed and repeatable workflows. Plain language is for messy, conversational work when the user does not remember the exact command or wants to explain context first.

The chat composer should suggest commands while the user types:

- Typing `/` should show matching slash commands.
- Typing plain language like "create a product brief" should suggest the closest command without requiring the user to use it.
- `Tab` should accept the highlighted command suggestion.
- Plain language should remain valid even when the user ignores the suggestion.

Every major Jimmy action should have:

- A slash command form.
- One or more plain-language equivalents.
- Auto-save for reusable draft documents and wiki references.
- A confirmation step before sending emails, overwriting files, or creating official safety records.

Examples:

| Action | Slash Command | Plain Language |
| --- | --- | --- |
| Draft email | `/draft-email` | "Draft a response to this email." |
| Summarize email | `/summarize-email` | "Summarize this thread and tell me what I owe them." |
| Create PDF | `/create-pdf` | "Turn this into a PDF." |
| Create Excel file | `/create-excel` | "Make this into an Excel checklist." |
| Create Word file | `/create-word` | "Export this as a Word document." |
| Create PowerPoint | `/create-powerpoint` | "Turn this toolbox talk into slides." |
| Create email draft | `/create-email-draft` | "Draft an Outlook email from this." |
| Export CSV | `/export-csv` | "Export this tracker as CSV." |
| Export HTML | `/export-html` | "Make this a printable web page." |
| Export JSON | `/export-json` | "Export this as structured data." |
| Create calendar file | `/create-calendar-file` | "Make calendar events for these inspections." |
| Export package | `/export-package` | "Bundle this report with attachments." |
| Create QR sheet | `/create-qr-sheet` | "Make QR codes for these forms." |
| Dashboard snapshot | `/dashboard-snapshot` | "Export today's dashboard summary." |
| Explain process | `/explain` | "Explain how the dashboard works." |
| Create wiki | `/wiki-from-doc` | "Turn this documentation into a wiki page." |
| Product brief | `/product-brief` | "Make a product brief from these notes." |
| Toolbox talk | `/toolbox-talk` | "Create a toolbox talk for ladder safety." |
| Inspection report | `/inspection-report` | "Make an inspection report from these jobsite notes." |
| Incident summary | `/incident-summary` | "Summarize this incident and list follow-ups." |
| OSHA reference | `/osha-reference` | "Help me make an OSHA reference page for fall protection." |

If the user enters a future slash command that is not implemented yet, Jimmy should explain the intended command shape and offer to draft the content in markdown first.

## Process Explanations

Jimmy should be able to explain how a process works when the user asks in plain language or uses `/explain`.

Examples:

- "How does the dashboard work?"
- "Explain how Outlook email connects to Jimmy."
- "Walk me through how uploads become source knowledge."
- "How do I export a report?"

Response style:

- Use concise numbered steps.
- Explain what Jimmy does.
- Explain what the user needs to do.
- Say what gets saved, changed, or exported.
- Call out anything that requires approval.
- Avoid deep technical detail unless the user asks for it.

## Auto-Save Drafts

Generated outputs should not be saved as reusable references automatically. Jimmy should draft the output, show it to the user, and ask whether this is the final draft to save as a reference item.

Draft-first outputs include:

- Documentation created from pasted notes.
- Wikis created from source documents.
- Product briefs.
- Toolbox talks.
- Inspection reports.
- Incident summaries.
- OSHA reference pages.

When the user confirms with language such as `save as reference`, Jimmy should save the final draft into `docs/` for future reference and template reuse.

Saved reference items should be organized under:

```text
docs/
  reference-items/
    product-briefs/
    toolbox-talks/
    inspection-reports/
    incident-summaries/
    osha-references/
    source-wikis/
    wiki-drafts/
```

Jimmy should still ask for approval before high-impact actions such as sending emails, overwriting an existing file, or treating a safety document as official.

## Auto-Capture User Data

Jimmy should automatically preserve substantial information the user provides in chat.

Auto-captured inputs include:

- Long pasted notes.
- Policies.
- Procedures.
- Requirements.
- OSHA text.
- Inspection notes.
- Incident notes.
- Product details.
- Checklists.
- Safety documentation.

These inputs should be saved under:

```text
docs/
  source-knowledge/
```

The user should not need to explicitly say "save this" for normal reference material. Jimmy should quietly capture it as markdown wiki knowledge, index it as source material, and make it available for future document generation.

## Dashboard Intelligence

Jimmy should populate the dashboard from connected systems when available:

- Outlook email for incoming requests, draft replies, waiting-on items, and follow-ups.
- Outlook calendar for meetings, inspections, training, deadlines, and preparation notes.
- Microsoft Teams and Slack for safety channels, mentions, decisions, and action items.
- SharePoint, OneDrive, local folders, and Google Drive for policies, templates, manuals, and source documents.

The dashboard should remain organized around what makes the user's safety-manager job easier: today, upcoming, overdue, waiting on others, draft responses, inspections, incidents, training, and documents that need review.

## Source Knowledge

Jimmy's stored knowledge base should always be markdown.

Source knowledge can come from:

- Chat uploads through the composer `+` button.
- Files placed in `work-wiki-data/source-documents` for conversion.
- Auto-captured chat intake.

All source knowledge should be converted into markdown wiki pages under:

```text
docs/
  source-knowledge/
```

Text-like uploads should not be stored as separate source files. They should be converted directly into markdown source-knowledge wikis. Files manually placed in `work-wiki-data/source-documents` may remain there as user-managed inputs, but Jimmy's reference layer should still be the markdown wiki generated from them.

Stored source knowledge can be listed with `/sources` and used with `/wiki-from-doc [file or topic]`.

## Export Formats

Markdown is Jimmy's knowledge format. PDF, Excel, Word, and similar formats should be treated as export formats for sending information to someone else.

Future export commands:

```text
/create-pdf
/create-excel
/create-word
/create-powerpoint
/create-email-draft
/export-csv
/export-html
/export-json
/create-calendar-file
/export-package
/create-qr-sheet
/dashboard-snapshot
```
