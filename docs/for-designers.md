# Buildline for designers

You own **how it looks and behaves**, and the design system that keeps it consistent.

## Once per project: `context/design.md`

This is how agents learn your system. Fill it in (or let `/buildline-onboard` draft it from the code, then correct it):

- 3–5 **principles** that decide trade-offs ("clarity over density").
- **Source of truth:** Figma file, Storybook URL, token files.
- **Tokens** by name: colour, type, spacing, radius, motion. Agents are told to use names, never raw values.
- **Components:** what exists, where it lives, when to use which.
- **Patterns:** forms, tables, empty states, errors, notifications.
- **Accessibility baseline:** WCAG 2.2 AA by default.

The dashboard's **Context** tab lets you edit it in the browser.

## Per feature: `/buildline-design <id>`

Bring what you have: a Figma link, screenshots, a sketch, a competitor's screen. Claude describes what it sees, confirms its reading, then writes `## Design → ### Experience` in the spec:

1. **Flow:** steps from entry to outcome.
2. **Screens and states:** default, loading, empty, error, success, disabled, permission variants. Missing states are the most common design bug.
3. **Components:** reused (with paths), or new with a reason.
4. **Copy:** labels, messages, errors in plain language.
5. **Accessibility and responsive behaviour.**

For visual work, ask for a **throwaway prototype** first: a single HTML page or a story, with screenshots, before anything goes into production code.

The `buildline-design-reviewer` subagent then checks the design against your system and the acceptance scenarios: states, tokens, hierarchy, contrast, keyboard path, touch targets.

## After build

The verifier saves screenshots to `features/<id>/evidence/`. Review them, and the review station runs the design reviewer on them too. Approve design in the dashboard when you're happy.

## Keep the system alive

When a feature introduces a new component or pattern, the ship station adds it to `context/design.md`. Review those additions; they're how the next feature stays consistent.
