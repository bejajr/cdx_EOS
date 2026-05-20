# Parked Feature: New Request Intake

## Status

Parked for later.

The active app no longer shows the `New request` tab/button or the `/new` command as a primary workflow. The concept is preserved here so it can be brought back later if useful.

## Original Intent

The New Request flow was intended to turn a client or coworker request into a structured job wiki.

The user would provide:

- Request title
- Requester name
- Requester type
- Organization or team
- Priority
- Due date
- Summary
- Desired outcome
- Raw request
- Next action
- Reminder details
- Constraints

After submission, the app would:

1. Create a job in SQLite.
2. Create a markdown wiki folder.
3. Generate starter markdown files.
4. Create initial tasks.
5. Create reminders.
6. Open the job workspace.

## Generated Markdown Files

The flow created:

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

## Why It Is Parked

The current direction is to make Jimmy the primary interface and reduce extra tabs or workflows until the core chat-driven experience feels right.

## How To Bring It Back

Re-enable:

- Sidebar `New request` button
- Jimmy `/new` command
- Quick action `Create request`
- `intakeView`
- `openIntake`
- `submitIntake`

The server-side job creation logic still exists and can be reused.

