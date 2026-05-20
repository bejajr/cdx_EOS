# EOS Platform Architecture

EOS is an AI-native work operating system for individuals, teams, and organizations.

## Product Intent

EOS is not a chatbot application. Chat is the front door, but the platform is an operational layer for workspaces, knowledge, files, memory, events, agents, tasks, roles, and workflows.

## Core Rules

- Workspaces are the center of the system.
- The database is the source of truth.
- Markdown files are synchronized operational views.
- AI inherits user permissions.
- Knowledge should outlive employees.
- Agents are modular and event-driven.
- Local mode must remain useful without cloud services.
- Cloud and SaaS readiness should be preserved in schema and boundaries.

## Architecture Layers

1. Frontend UI
2. Workspace layer
3. Permissions layer
4. AI orchestration layer
5. Agents, connectors, and tools
6. Memory, knowledge, files, and events

## Workspace Types

- Personal workspace: private memory, files, chats, workflows, style, projects, and connectors.
- Organization workspace: departments, teams, roles, employees, shared files, shared workflows, shared memory, and admin systems.

Hierarchy:

```text
Organization
-> Department
-> Team
-> Project workspace
```

## MVP Phases

Phase 1:

- Workspace system
- SQLite schema
- Event system
- Core agents
- Workspace-aware chat
- File indexing
- Markdown synchronization
- Basic RAG
- Local file access

Phase 2:

- Projects
- Tasks
- Memory system
- Connectors
- Scheduled workflows

Phase 3:

- Organizations
- Teams
- Permissions
- Shared workspaces

Phase 4:

- Enterprise governance
- Advanced automation
- Operational analytics
- Plugin ecosystem

## Markdown System

Markdown is the human-readable operational layer. EOS syncs database state into markdown files such as:

- ABOUT-ME.md
- MY-AI-STYLE.md
- PROJECTS.md
- TASKS.md
- DECISIONS.md
- WORKFLOWS.md
- LESSONS-LEARNED.md
- CONTEXT-LOG.md

The files are indexed back into the retrieval layer so the AI can use them as context.

## Permission Principle

The AI can only retrieve what the user can access. Retrieval should:

1. gather candidate context
2. filter by workspace, group, role, and permissions
3. rank allowed results
4. send only authorized context to the AI

## Current Implementation Note

This repository currently runs through `server.js` and a static frontend. Next.js App Router route files are scaffolded for migration, but the active runtime endpoints are in `server.js`.
