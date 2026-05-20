# Integration Setup Guide

Status: Planned

## Goal

Connect Jimmy to the systems that make the daily dashboard useful while keeping the workflow approval-based and safe.

Jimmy should use integrations to populate the dashboard, detect action items, draft responses, create reminders, and turn durable knowledge into markdown wikis.

## Connection Order

1. Outlook Calendar
2. Outlook Email
3. Microsoft Teams
4. SharePoint or watched local folders
5. Slack, if important work happens there
6. Export tools for PDF, Excel, Word, PowerPoint, CSV, HTML, JSON, calendar files, ZIP packages, QR sheets, and dashboard snapshots
7. Safety or project systems such as Procore, Autodesk Construction Cloud, Smartsheet, SDS/training tools, inspection systems, and incident systems

## Outlook Calendar

Purpose:

- Populate today, upcoming meetings, inspections, training, deadlines, and preparation notes.

Access needed:

- Read calendar events.
- Read event attendees, locations, notes, and online meeting links.

Jimmy should:

- Show today's schedule.
- Flag inspections, training, incident follow-ups, and deadlines.
- Prepare meeting briefs from related source knowledge.

Jimmy should ask before:

- Creating, editing, cancelling, or moving calendar events.

## Outlook Email

Purpose:

- Summarize email threads, detect action items, draft replies, and identify waiting-on items.

Access needed:

- Read selected mail folders.
- Read email threads and attachments.
- Create draft emails.

Jimmy should:

- Populate emails needing response.
- Create draft replies for review.
- Extract tasks, reminders, decisions, and source knowledge.

Jimmy should ask before:

- Sending emails.
- Forwarding emails.
- Deleting or moving emails.

## Microsoft Teams

Purpose:

- Monitor safety channels, project channels, mentions, decisions, and action items.

Access needed:

- Read selected Teams and channels.
- Read messages and attachments.

Jimmy should:

- Surface mentions and requests.
- Extract action items and decisions.
- Convert durable procedures or decisions into markdown source knowledge.

Jimmy should ask before:

- Posting messages.
- Replying to channels.

## SharePoint, OneDrive, And Local Folders

Purpose:

- Feed Jimmy company policies, safety manuals, inspection templates, toolbox talks, SDS/product references, and jobsite procedures.

Access needed:

- Read selected folders.
- Optional watched folder sync.

Jimmy should:

- Convert source material into `docs/source-knowledge` markdown wikis.
- Use markdown as the reference layer.
- Treat PDF, Excel, Word, and PowerPoint as export or input formats, not internal memory.

## Slack

Purpose:

- Use only if important requests happen in Slack.

Access needed:

- Read selected workspaces/channels.
- Read direct messages if approved.

Jimmy should:

- Surface safety requests, mentions, decisions, and follow-ups.

Jimmy should ask before:

- Posting or replying.

## Dashboard Mapping

Integrations should populate these dashboard sections:

- Today
- Action Queue
- Waiting On
- Safety Watch
- Draft Responses
- Source Knowledge
- Pick up where I left off
- Most recent activity

## Dashboard Walkthrough

The Dashboard tab should explain itself directly in the app.

Daily flow:

1. Jimmy collects local tasks, reminders, markdown source knowledge, draft responses, and connected-system data.
2. Jimmy sorts that information into Today, Action Queue, Waiting On, Safety Watch, Draft Responses, Source Knowledge, Pick Up Where I Left Off, and Recent Activity.
3. The user acts from the dashboard by asking Jimmy to draft, summarize, export, schedule, prepare, or follow up.
4. Jimmy asks before any external action such as sending, submitting, sharing, or changing calendar events.

## Clickable Integration Walkthroughs

Each integration card in Settings should be clickable.

When clicked, Jimmy should show:

- What the connector does.
- Step-by-step connection instructions.
- Required permissions.
- Which dashboard sections it will populate.
- Which actions require approval.

Example: Outlook Email should explain how to sign in, approve selected mail access, choose folders, run the first sync, populate Draft Responses and Waiting On, and keep send approval enabled.

## Approval Rules

Jimmy can automatically:

- Read approved sources.
- Summarize content.
- Draft responses.
- Create markdown source knowledge.
- Create local tasks and reminders.
- Update the dashboard.

Jimmy must ask before:

- Sending emails or messages.
- Changing calendar events.
- Submitting reports.
- Marking safety/compliance documents final.
- Overwriting files.
- Sharing exports outside the local app.
