# Safety Manager Assistant Roadmap

Status: Future

## Goal

Expand Jimmy from a personal work wiki into a safety manager assistant for a construction company.

Jimmy should help with daily administrative safety work: reading and drafting email responses, generating documents, turning company documentation into searchable wikis, and creating safety-specific deliverables such as OSHA-related references, inspection notes, toolbox talks, incident summaries, product briefs, and recurring reports.

## Core Capabilities

### Email Assistance

Jimmy should be able to:

- Read selected emails and email threads.
- Summarize long conversations.
- Identify required action items, deadlines, and missing information.
- Draft replies in the user's voice.
- Create tasks and reminders from emails.
- Link emails back to the related job wiki.

Safety rule:

- Jimmy may draft email responses, but should not send emails without explicit user approval.

### Document Generation

Jimmy should be able to generate common work documents:

- Excel files
- PDF files
- Product briefs
- Safety briefs
- Meeting agendas
- Meeting minutes
- Inspection summaries
- Incident summaries
- Corrective action reports
- Toolbox talks
- Training handouts
- Daily or weekly safety reports
- Jobsite safety checklists
- OSHA reference summaries

Generated documents should be saved under the related job folder when possible:

```text
work-wiki-data/
  jobs/
    job-slug/
      generated/
        report.xlsx
        report.pdf
        product-brief.md
```

### Wiki Creation From Documentation

Jimmy should be able to take source documentation and turn it into internal wiki pages.

Inputs may include:

- PDFs
- Word documents
- Excel files
- Email threads
- Pasted notes
- Screenshots
- Safety manuals
- Manufacturer documentation
- OSHA guidance
- Company policies
- Jobsite procedures

Outputs should be searchable markdown pages in `docs/` or job-specific wiki files.

Each generated wiki should include:

- Plain-language summary
- Key requirements
- Step-by-step procedures
- Who is responsible
- Required forms or records
- Renewal or review dates
- Source document references
- Unknowns or items requiring human verification

### Safety Manager Knowledge Base

Jimmy should maintain reusable safety reference areas such as:

- OSHA references
- Company safety policies
- Jobsite procedures
- Equipment documentation
- Training materials
- Inspection workflows
- Incident response workflows
- Subcontractor documentation
- Product and SDS references

Recommended folder structure:

```text
docs/
  safety/
    osha/
    company-policies/
    toolbox-talks/
    inspections/
    incidents/
    training/
    equipment/
    products/
```

## Important Safety Boundaries

Jimmy can help organize, summarize, draft, and reference safety material, but the user remains responsible for final review.

Jimmy should:

- Preserve source facts exactly.
- Clearly label uncertainty.
- Cite source files or links when generating safety guidance.
- Avoid inventing OSHA requirements.
- Ask for missing jurisdiction, date, trade, equipment, and jobsite context when needed.
- Distinguish between company policy, manufacturer documentation, and OSHA guidance.
- Mark generated safety documents as drafts until reviewed.

Jimmy should not:

- Present generated safety guidance as legal advice.
- Claim compliance without evidence.
- Send official reports, emails, or corrective actions without approval.
- Replace competent-person review where required.

## Suggested Technical Additions

### File Generation Libraries

Use Node.js libraries for generated files:

- Excel: `exceljs`
- PDF: `pdf-lib` or `puppeteer` for HTML-to-PDF
- Word documents, if needed later: `docx`
- Markdown parsing: `gray-matter` and `marked` if the app grows beyond simple markdown editing

### Email Integration

Possible options:

- Gmail connector
- Outlook connector
- IMAP for local/private email access
- Manual email import by pasting or uploading `.eml` files

Email should be imported into a review queue before Jimmy acts on it.

### Document Ingestion

Add upload support for:

- `.pdf`
- `.docx`
- `.xlsx`
- `.csv`
- `.txt`
- `.md`
- images and screenshots

Extracted text should be stored with source metadata so Jimmy can cite where an answer came from.

### Database Tables

Future tables may include:

- `source_documents`
- `generated_documents`
- `email_threads`
- `email_drafts`
- `safety_references`
- `document_exports`

## First Build Phase

Build the smallest useful version first:

1. Add a source-document import flow that converts pasted or uploaded documentation into a wiki page.
2. Add a document generator command for markdown-to-PDF.
3. Add an Excel generator for a simple safety report or checklist.
4. Add draft-only email support through manual paste/import before connecting live email.
5. Add safety-specific templates for OSHA notes, toolbox talks, inspections, incident summaries, and product briefs.

## Source Knowledge Intake

Status: Active first pass

Jimmy can use source material in two ways:

- Files uploaded through the chat composer `+` button.
- Files placed directly in `work-wiki-data/source-documents` for conversion.

The app converts uploaded and pasted source material into markdown source-knowledge wikis under `docs/source-knowledge`. Text-like files are indexed immediately:

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.htm`
- `.log`

PDF, Word, and Excel uploads can create metadata markdown wikis now, but full text extraction for those formats is a later build step.

Current commands:

- `/sources` lists source knowledge wikis.
- `/wiki-from-doc [file or topic]` drafts from an indexed source knowledge wiki.

Plain-language examples:

- "Turn the uploaded ladder policy into a wiki."
- "Use the fall protection source knowledge as a reference."
- "What does the uploaded inspection checklist say about guardrails?"

## Example Commands

Future Jimmy commands:

- `/draft-email`
- `/summarize-email`
- `/create-pdf`
- `/create-excel`
- `/create-word`
- `/create-powerpoint`
- `/create-email-draft`
- `/export-csv`
- `/export-html`
- `/export-json`
- `/create-calendar-file`
- `/export-package`
- `/create-qr-sheet`
- `/dashboard-snapshot`
- `/explain`
- `/product-brief`
- `/toolbox-talk`
- `/inspection-report`
- `/incident-summary`
- `/osha-reference`
- `/wiki-from-doc`

## Plain-Language Equivalents

The user should not need to memorize slash commands. Every command should also work through normal language.

Examples:

| Slash Command | Plain-Language Equivalent |
| --- | --- |
| `/draft-email` | "Draft a reply to this email and keep it professional." |
| `/summarize-email` | "What is this email thread asking me to do?" |
| `/create-pdf` | "Make this into a PDF I can send." |
| `/create-excel` | "Build an Excel checklist from this." |
| `/create-word` | "Export this as a Word document." |
| `/create-powerpoint` | "Turn this safety briefing into slides." |
| `/create-email-draft` | "Draft an Outlook email from this report." |
| `/export-csv` | "Export this corrective action log as CSV." |
| `/export-html` | "Make this a printable web page." |
| `/export-json` | "Export this as structured data." |
| `/create-calendar-file` | "Create calendar events for these inspections." |
| `/export-package` | "Bundle this report with attachments and references." |
| `/create-qr-sheet` | "Create QR codes for these safety forms." |
| `/dashboard-snapshot` | "Export today's safety dashboard summary." |
| `/explain` | "Explain how this process works." |
| `/product-brief` | "Create a product brief from these specs." |
| `/toolbox-talk` | "Write a toolbox talk about heat illness prevention." |
| `/inspection-report` | "Turn these inspection notes into a report." |
| `/incident-summary` | "Summarize this incident and give me corrective actions." |
| `/osha-reference` | "Create an OSHA reference page for this topic." |
| `/wiki-from-doc` | "Turn this document into a wiki page for future reference." |

Plain-language requests should use the same backend workflows as slash commands. Jimmy should infer the intended action, ask a short clarifying question when required fields are missing, and show a draft before finalizing important outputs.

The interface should help the user discover commands without memorizing them. As the user types, Jimmy should suggest likely slash commands for both command-style input and plain-language requests.

Jimmy should also explain processes in concise plain language when asked. Process explanations should use short numbered steps, clarify what Jimmy does, what the user does, what gets saved or exported, and where approval is required.

## Draft Review And Reference Saving

Status: Active first pass

Jimmy should draft generated outputs first, then ask whether this is the final draft to save as a reusable reference item. Raw user-provided information should still be auto-filed as markdown source material.

Saved reference items should:

- Save into `docs/`.
- Include a `Draft Status` section.
- Clearly say they are pending human review.
- Remain searchable and reusable for future work.
- Be treated as references or templates, not official safety records.

Jimmy should still require explicit approval before:

- Sending an email.
- Overwriting an existing file.
- Marking a safety/compliance document as final.
- Creating or submitting an official report.

## Frictionless Data Capture

Status: Active first pass

Jimmy should automatically save and organize substantial information the user gives him. The user should be able to paste notes, policies, procedures, OSHA text, inspection findings, incident details, product details, or checklist content into chat and then later ask Jimmy to generate documents without manually filing that material.

Auto-captured chat inputs and uploaded source material are saved as markdown source-knowledge wikis in:

```text
docs/source-knowledge/
```

Jimmy's knowledge base should always be markdown. Original upload formats should not be the primary memory layer.

PDF, Excel, Word, and similar formats should be export outputs for sending information to someone else, not Jimmy's internal reference format.

Jimmy should use relevant excerpts from source-knowledge markdown wikis for future prompts so large source material does not waste tokens.

Generated outputs are saved into:

```text
docs/auto-generated/
```

Recommended generated-document folders:

- `product-briefs`
- `toolbox-talks`
- `inspection-reports`
- `incident-summaries`
- `osha-references`
- `source-wikis`
- `wiki-drafts`

Operating principle:

- If the user gives Jimmy data, Jimmy should preserve it.
- If Jimmy generates a reusable document, Jimmy should ask whether the final draft should be saved as a reference item.
- If the action has external consequences, Jimmy should ask first.

## Dashboard And Integrations

Status: Planned

Jimmy should populate the dashboard from connected systems so the user does not need to manually assemble the day.

Priority connectors:

- Outlook Email
- Outlook Calendar
- Microsoft Teams
- Slack
- SharePoint
- OneDrive or watched local folders
- Google Drive
- Gmail and Google Calendar if any work happens outside Outlook
- Safety platforms for inspections, incidents, SDS, training, subcontractor documentation, and compliance
- Project management systems such as Procore, Autodesk Construction Cloud, Smartsheet, Asana, or similar tools

Dashboard sections should include:

- Today
- Upcoming inspections
- Open corrective actions
- Draft email responses
- Waiting on others
- Overdue items
- Training renewals
- Incident follow-ups
- Documents needing review
- Recent source knowledge and reference updates

Recommended build order:

1. Connect Outlook Email and Calendar.
2. Populate the dashboard from email action items, calendar events, deadlines, and draft responses.
3. Add Teams for safety/project channels and mentions.
4. Add SharePoint or watched folders for policies, templates, manuals, and OSHA/source references.
5. Add Slack if important work happens there.
6. Add jobsite-specific safety or project platforms after the daily dashboard is reliable.

Detailed setup instructions are tracked in `docs/integration-setup-guide.md`.

## Daily Safety Manager Workflows

Jimmy should eventually support:

- Morning safety dashboard
- Open corrective actions
- Upcoming training renewals
- Inspection schedule
- Incident follow-ups
- Pending subcontractor documentation
- Draft responses to safety-related emails
- Generate weekly safety summary
- Convert new documentation into searchable wiki references
