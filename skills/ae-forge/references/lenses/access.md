# Access — keyboard and assistive-technology operability lens

## Contract metadata

- **ID/version:** `access` / `1`
- **Covers:** accessibility
- **Escalates to:** `flow`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when work creates or changes an interactive control, a custom widget
built from non-native elements, a status or error announcement, or a focus
transition (opening/closing a dialog, submitting a form, a route change). Do
not activate solely because a component uses a `div` or `span` — many are
decorative and carry no interaction. Do not use Access to judge whether the
journey's states are complete or its copy is clear; a control that is fully
operable by keyboard and assistive technology but leads to a dead-end or a
silent success is a `journey` finding, not an `access` one.

## Inputs and missing inputs

Read the rendered interface or a recorded interaction trace, the control's
expected role/name/state (from the design system or platform convention when
no explicit spec exists), and any keyboard or assistive-technology walkthrough
already performed. If there is no way to exercise the control by keyboard
alone (no runnable build, no recorded keyboard interaction), return
`needs_input` naming `keyboard_operable_build_or_trace`. Never infer focus
order, exposed role, or announcement text from source code or a screenshot
alone — a visual resemblance to a native control is not evidence of its
accessibility tree.

## Questions and procedure

1. Can every interactive control reachable on the happy and error paths be
   reached using only the keyboard, in an order that matches the visual and
   logical sequence?
2. Can each reached control be operated (activated, expanded, dismissed) with
   the keyboard alone, with a visible focus indicator at every step?
3. For a custom component (a styled `div`-based button, toggle, tab, or
   combobox), does it expose the correct role, name, and state to assistive
   technology, or only a visual resemblance to the native control it imitates?
4. When focus moves programmatically (dialog open/close, route change, error
   surfaced), does it land somewhere a screen-reader user can act on, rather
   than being lost or reset to the top of the page?
5. Is a critical status (error, success, required-field, disabled) signaled by
   more than color or position alone, and is it announced to assistive
   technology when it appears asynchronously?
6. Confirm sufficient contrast for text and non-text UI signals central to
   completing the journey.

The intermediate deliverable is a per-control table of control, keyboard
reachability, operability, exposed role/name/state, and focus-management
disposition.

## Evidence and finding taxonomy

Required evidence is a keyboard-only walkthrough (recorded or directly
exercised) and either automated accessibility-tree output or a manual
role/name/state check for each custom component in scope. Automated results
alone, with no keyboard walkthrough, are insufficient. Finding categories are
unreachable control, inoperable control, missing or incorrect exposed
role/state, lost or mismanaged focus, and color/contrast-only signaling.
Severity follows the shared finding contract, weighted by whether the gap
blocks task completion versus degrades it.

## Non-decisions and escalation

Access does not decide whether the journey's states are complete, whether an
error is recoverable, or whether the flow's structure is otherwise sound —
those are `journey` and Flow's broader remit. It does not set visual brand or
choose a component library. Escalate to Flow when an accessibility gap blocks
completion of the journey itself (a focus trap, an unreachable control with no
alternate path) or when an ambiguous interaction pattern has no established
assistive-technology convention. Return the request to Forge; do not dispatch
Flow.

## Stop conditions

Stop once every reachable interactive control in scope has a keyboard and
assistive-technology disposition or a structured gap. Stop immediately on no
keyboard-operable build or trace, forbidden access, or satisfied coverage. Do
not report a contrast or labeling nit as a blocking finding when the control
is otherwise fully keyboard- and screen-reader-operable; note it as low
severity instead of withholding a result.

## Examples

### Valid worked example

A custom dropdown filter renders visually like a native `<select>` but is
built from a `div` with `onClick` handlers and no `role`, `aria-expanded`, or
keyboard handling. Tabbing reaches the trigger but Enter/Space/Arrow keys do
nothing, and a screen reader announces it only as "clickable text." Access
cites the recorded keyboard trace and emits:

```json
{
  "schema": 2,
  "id": "finding:<computed>",
  "lens": "access",
  "severity": "high",
  "criterion": "AC-filter-dropdown-operable",
  "invariant": "every interactive control operable by keyboard exposes its role and state to assistive technology",
  "evidence_ids": ["observed:keyboard-trace-filter-dropdown"],
  "affected_behavior": "custom filter dropdown cannot be opened, navigated, or selected via keyboard and exposes no listbox role or expanded state",
  "smallest_repair": "add role=\"listbox\"/aria-expanded and keyboard handling (Enter/Space/Arrow/Escape) to the existing div-based trigger",
  "verification": "repeat the keyboard trace and confirm the dropdown opens, options are reachable by arrow keys, and a screen reader announces the expanded/collapsed state",
  "status": "open"
}
```

### Misleading example

"It looks and is styled exactly like the native dropdown, so it behaves like
one" is rejected because visual resemblance says nothing about the underlying
DOM semantics — a `div` with click handlers exposes no role, state, or
keyboard behavior to assistive technology regardless of how convincingly it
is styled.

### Missing-input example

Without a runnable build or a recorded keyboard interaction for the new
checkout summary panel, Access cannot exercise reachability or operability
from a screenshot alone. It returns `needs_input`, names
`keyboard_operable_build_or_trace` as the missing input, and does not assume
the panel is operable because it renders correctly.
