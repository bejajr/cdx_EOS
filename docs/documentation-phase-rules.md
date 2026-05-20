# Documentation Phase Rules

## Trigger

When the user says `documentation`, switch into a documentation-building phase.

## Behavior

During the documentation phase, any documentation, notes, examples, requirements, screenshots, explanations, or decisions the user provides should be organized into markdown files.

The goal is to make the project knowledge durable, easy to reference, and useful to Jimmy later.

## Markdown-First Rule

If the user provides information that should be preserved, create or update a markdown file under `docs/`.

Use focused files instead of one giant document.

Recommended files:

- `docs/jimmy-chat-first-interface.md`
- `docs/documentation-phase-rules.md`
- `docs/parked-new-request-intake.md`
- New topic-specific markdown files as needed

## Documentation Style

Use:

- Clear headings
- Short sections
- Bullets for requirements
- Explicit status labels such as `Active`, `Parked`, `Future`, or `Decision`
- Plain language

Avoid:

- Burying decisions in chat only
- Mixing unrelated topics in one file
- Rewriting user intent into something more complex than needed

## Jimmy's Role

Jimmy is the main assistant and should use the documentation as project memory. The app should eventually make these markdown files searchable and referenceable from the main chat.

