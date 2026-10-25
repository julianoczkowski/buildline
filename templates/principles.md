# Principles

The non-negotiables every change is checked against. Keep this list short; every line should earn its place. Edit freely, since the factory never overwrites this file.

## Product

1. **Outcomes over output.** Every feature names the user problem it solves and how we'll know it worked.
2. **Smallest valuable slice first.** Ship a thin version end to end, then improve it.
3. **Plain language.** UI copy says what happened and what to do next.

## Design

4. **Use the system.** Reuse existing components and tokens; new ones need a reason.
5. **Every state is designed.** Loading, empty, error, success and disabled are part of the feature, not polish.
6. **Accessible by default.** WCAG 2.2 AA: keyboard reachable, labelled, sufficient contrast.

## Engineering

7. **Evidence, not claims.** Nothing is done until its verification has been run and observed.
8. **Tests protect behaviour.** Tests assert what users and clients see; never weaken a test to make it pass.
9. **Follow the codebase.** Match existing conventions; if you break one, say why in the spec.
10. **No secrets in code.** Configuration and credentials come from the environment.
11. **Reversible changes.** Prefer small commits, feature flags for risky changes, and migrations that can roll back.
