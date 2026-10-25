# Factory for product managers

You own **what** gets built and **how we know it's done**. You don't need the terminal for most of it.

## Your tools

- **Dashboard:** `npx factory-cli ui` (ask a developer to run it once if you've never used a terminal). You get a board of every feature by station. Click a card to read or edit its spec, approve it, or move it along.
- **Claude Code or Claude Desktop:** `/factory-new <idea>` to propose something, `/factory-spec <id>` to write it up together, `/factory` to see status.

## A typical feature

1. **Propose:** `/factory-new Let returning customers reorder in one click`, or **+ New** in the dashboard.
2. **Spec:** `/factory-spec 007`. Claude interviews you one question at a time, always offering its best guess so you can just say yes. It asks about who the user is, the smallest valuable version, unhappy paths, what must not change, and how you'll measure success.
3. **Read the critique:** a separate reviewer agent checks the spec for vague requirements ("fast", "intuitive"), missing edge cases and hidden scope.
4. **Approve:** in the dashboard, or say "approved" to Claude.
5. **Watch it move:** design → plan → build → verify → review. Each card shows who it's waiting on.
6. **Check the evidence:** the **Verification** section of the spec lists every acceptance scenario with PASS/FAIL and screenshots.

## Writing acceptance scenarios that work

They're the contract. Agents can't edit them during build (a hook blocks it), so make them count.

- **Observable:** "the user sees…", "the API returns…", not "the code handles…".
- **Specific:** `Given a cart with 3 items` beats `Given a cart`.
- **Cover unhappy paths:** empty, error, no permission, slow network.
- **Include "must not change":** `Given an existing subscriber, When they log in, Then their plan is unchanged`.

```
A2 Given a signed-in user with no saved carts
   When they open "Saved carts"
   Then they see "Nothing saved yet" and a "Continue shopping" link
```

## Epics

If it's bigger than one PR, intake marks it `epic`. The spec station ends by proposing 2–6 thin, shippable child features, each with its own spec and acceptance scenarios.
