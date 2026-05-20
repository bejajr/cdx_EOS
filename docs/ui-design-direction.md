# UI Design Direction

## Status

Active direction.

## Reference Intent

The app should feel like a dark, focused personal command center:

- Left sidebar for navigation and recent work
- Main chat as the primary surface
- Top tabs for `Chat`, `Dashboard`, and `Wiki`
- Large centered greeting
- Prompt chips for common actions
- Bottom composer for Jimmy
- Settings and profile anchored in the bottom-left

## Personalization

Refer to the user as **Jake** in the interface.

Primary greeting:

```text
Good afternoon, Jake.
```

## Sidebar

The sidebar should include:

- JB's Kitchen brand
- Collapse/reopen control
- Jimmy
- Search
- Tasks
- Meetings
- Recents
- Jake profile at the bottom

The sidebar can collapse into a narrow rail. In the collapsed state, keep compact initials visible for primary navigation and keep the toggle available so Jake can reopen the full sidebar at any time.

Do not show a standalone Settings button in the sidebar. Jake's profile should open a small dark popover from the bottom-left. The profile display inside the popover should stay compact, and the popover should include a `Settings` tab. The body starts mostly blank so new settings can be added over time.

The profile popover should stay compact: small title, small Jake/Profile row, small circular `J` avatar, and a lightweight Settings tab row. Avoid oversized modal-like spacing in this anchored popover.

Clicking `Settings` inside the profile popover should open a full-screen settings page overlay. The overlay should emulate a focused dark settings surface with:

- Top bar with back/close control, `Settings`, and a small `Beta` pill
- Left settings navigation
- `Personal Settings` selected by default
- Personal settings content with Jake's name, dark/light theme controls, synced timezone, and location

Theme controls should only show `Dark mode` and `Light mode`. Dark mode is the default. Choosing light mode should switch the full app to a brighter white interface and persist locally.

Changing the name in Personal Settings should use an explicit `Save` button. Saving should update every visible user reference, including the Jake profile labels, avatar initial, main chat greeting, and dashboard greeting. The name should persist locally.

Personal Settings should include an Avatar control. Clicking the avatar in settings should open a compact pop-up picker with several avatar styles. The default avatar should remain tied to the saved name's first initial, and the selected avatar style should apply anywhere the profile avatar appears.

The location setting should allow Jake to search for a city and select it from inferred dropdown results as he types. Selecting a city should update the selected city label below the search box, persist locally, and immediately update the dashboard location and weather temperature.

Timezone should automatically sync from the selected location. The dashboard greeting and date should use the selected location's timezone as well.

## Main Chat

The main chat should include:

- Centered welcome state
- Prompt chips:
  - `What am I working on?`
  - `/daily-brief`
  - `/capture`
  - `/reminders`
- Bottom-aligned composer
- Model selector display
- Send button

## Dashboard

The `Dashboard` tab should open a real overview page, not just a placeholder.

The dashboard should include:

- Time-aware greeting:
  - `Good morning, Jake!`
  - `Good afternoon, Jake!`
  - `Good evening, Jake!`
- Date at the top, formatted like:
  - `Wednesday, May 13th`
- Raleigh, NC temperature at the top
- Daily reminders
- Tasks
- Pick up where I left off
- Most recent activity

The dashboard should feel like a calm overview surface: quick to scan, not a second chat page.

## Tasks Page

Clicking the `Tasks` item in the left sidebar should open a dedicated Tasks page.

The Tasks page should include:

- Page title: `Tasks`
- Collapsible `To Do:` section
- Collapsible `Completed:` section
- Visible arrows showing whether each task section is open or closed
- Checkboxes next to tasks in `To Do:`
- A small `Add task` button
- A compact pop-up modal for adding a task
- Date and time fields in the add-task modal
- To Do task rows should include compact edit and delete actions
- Editing a To Do task should reuse the task modal
- To Do tasks automatically sorted by nearest due date first
- New To Do tasks should appear in the dashboard `Tasks` section
- Completed tasks should disappear from the dashboard `Tasks` section

Task completion should persist locally in SQLite.

Visual rule: the Tasks page should not use large boxed panels. Prefer a clean list surface with subtle dividers, compact spacing, and lightweight section headers.

## Wiki Page

Clicking the `Wiki` tab should open a dedicated Wiki page, not a job-specific wiki editor by default.

The Wiki page should:

- List markdown files from `docs/`
- Let Jake open and read each markdown page
- Let Jake manually create and edit wiki markdown pages
- Act as Jimmy's referenceable knowledge base
- Support refresh as new markdown documentation is added

Jimmy should support wiki-oriented slash commands:

- `/wiki` lists known wiki pages
- `/wiki [topic]` uses matching wiki pages as reference context for the answer
- `/create-wiki [title]` drafts a wiki from pasted notes
- `/document [title]` drafts documentation as a wiki
- `save wiki` saves Jimmy's latest wiki draft

## Current Implementation Notes

The `Chat` and `Dashboard` tabs are active. `Wiki` opens a shared markdown knowledge base backed by `docs/`. Jimmy remains the main working surface.

Manual Wiki tab additions and Jimmy-created wikis should save to the same `docs/` folder. Plain-language requests like "what does the dogs wiki say about Golden Retrievers?" should use the same section-aware wiki search as slash commands.
