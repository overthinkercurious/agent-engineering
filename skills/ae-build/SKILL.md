---
name: ae-build
description: >
  Dispatch target only for implementation in an active ae-forge run.
  Implement the accepted approach one working slice at a time and record executed checks.
  For standalone requests, start with ae-forge.
metadata:
  owns: "the implementation diff for one Agent Engineering run"
---

# Implementation

Implement the accepted approach one working slice at a time and record executed checks.

1. Require a Forge dispatch packet and active run. Check the assigned role,
   phase (build or repair), revision and exact scope against the ledger.
2. Resolve this installed skill directory using AE_SKILL_DIR, then
   CLAUDE_SKILL_DIR, then project .agents/skills or .claude/skills
   (or the host equivalent). Resolve ae-forge alongside it; use absolute
   paths. A missing sibling contract is AE-CONTRACT UNRESOLVED: report
   the installation gap and stop.
3. Read ae-forge/references/team.md, the assigned method identified by
   references/team.json, and only the attached lenses. Reopen the brief,
   relevant current source and accepted result files from the packet.
4. Follow the method and its exclusive ownership. A stage cannot grant
   user approval, expand scope, or enter a different phase on its own.
   Only Builder edits application code; Verifier reviews without repairs.
5. Write the shared result to a new .dev/work/<id>/results/ file and record
   it once with forge.mjs note. Reviews declare isolated or same-session
   context honestly. The coordinator renders the ticket and owns routing.
6. Return the result path, findings or unresolved decisions, and next action
   to Forge. Standalone requests start with ae-forge.
