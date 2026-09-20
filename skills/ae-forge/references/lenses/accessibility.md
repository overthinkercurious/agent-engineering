# Accessibility lens (WCAG conformance depth)

## Provenance

```yaml
standard: WCAG 2.2 (W3C Recommendation, October 2023)
level: AA unless the project declares otherwise
verified: "2026-09-20 w3.org/TR/WCAG22/ and w3.org/WAI/standards-guidelines/wcag/"
review_after: "2027-09-20"
```

WCAG 2.2 AA is the current target and remains so in practice for years:
WCAG 3.0 is a Working Draft whose Candidate Recommendation is not expected
before roughly Q4 2027, and it will not supersede 2.2 on arrival. If today is
past `review_after`, record `LENS STALE` for this lens and re-verify the
version before quoting a threshold from it.

## Exclusive constraint

Adds conformance-level depth to Experience's accessibility acceptance and to
Verifier's rendered-state inspection. It never takes over the journey itself —
Experience still owns whether a person can complete the task.

## Activates

Signals: `accessibility`, `a11y`, `wcag`, `screen-reader`, `keyboard`,
`contrast`, `aria`, `focus`, or any `rendered` risk on a project that declares
an accessibility requirement.

Skip when the change has no rendered surface. On a change to an internal tool
with no declared requirement, apply the keyboard and name/role/state checks
only, and record the rest as out of scope rather than silently passing.

## Thresholds

Quote these only while the provenance block above is current.

| Check | AA threshold |
|---|---|
| Text contrast | 4.5:1; large text (18.66px bold or 24px) 3:1 |
| Non-text contrast (controls, focus indicators, meaningful graphics) | 3:1 |
| Target size (minimum) | 24×24 CSS px, or spacing that gives an equivalent undisturbed area |
| Reflow | no loss of content or function at 320 CSS px width, and at 400% zoom |
| Text spacing | no clipping when line height 1.5×, paragraph 2×, letter 0.12em, word 0.16em |
| Motion | animation from interaction can be disabled unless essential |

## Checklist

**Operable without a mouse (Experience, Verifier)**

1. Reach and operate every control by keyboard alone, in an order that matches
   the visual sequence.
2. Confirm no keyboard trap: focus can always move out of every component,
   including custom widgets and embedded content.
3. Confirm focus is visible at every stop and is not obscured by sticky
   headers, footers, or overlays.
4. Confirm focus moves into a dialog or layer on open and returns to the
   element that triggered it on dismiss.
5. Confirm any pointer gesture with a path or multi-point input has a
   single-pointer alternative, and that actions complete on up-event so a
   mis-press can be aborted.

**Understandable to assistive technology (Experience, Verifier)**

6. Confirm every control exposes a programmatic name, role, and current state,
   and that the accessible name contains the visible label text.
7. Confirm validation errors identify the field and describe the fix in text,
   not by color or position alone.
8. Confirm status changes that do not move focus — async results, saves,
   counts — are announced, and that nothing announces so often it becomes
   noise.
9. Confirm headings and landmarks describe the real structure; a heading used
   for visual size is a defect here.
10. Confirm images carry meaningful alternative text, and that decorative
    images are marked decorative rather than described.

**Perceivable under user preference (Experience, Builder)**

11. Verify the layout reflows at the widths above without a second scroll axis,
    and that content and function survive 400% zoom.
12. Verify `prefers-reduced-motion` suppresses non-essential animation and
    parallax, and that nothing auto-plays for longer than five seconds without
    a pause control.
13. Verify forced-colors and high-contrast modes keep content visible: meaning
    carried only by a background image or a removed border is lost there.
14. Verify contrast against the table above using the computed rendered colors,
    not the design token's nominal value.

**Consistent across the journey (Experience)**

15. Confirm a repeated component keeps the same name and position across
    views, and that a help mechanism, once present, stays in the same place.
16. Confirm authentication does not depend on remembering or transcribing
    something, unless an alternative exists — a one-time code the user can
    paste satisfies this; a puzzle from memory does not.

## Evidence

An automated scan is a floor, never a pass: it cannot judge focus order,
reading order, ARIA correctness, or whether a label describes the control.
State which checks were exercised in a rendered environment and which were
read from source. When no rendered environment is available, name the exact
unverified checks — never report conformance that was not observed.

## Findings

Every finding names the check, the affected journey step, and the threshold or
criterion it fails — not a preference. A contrast ratio below the table above
is a defect; a color someone dislikes is not.

## Authority

This lens narrows what a role must check; it never outranks the project's own
documented conventions, design system, or an enforced gate. Where the
repository declares its own minimum target size, contrast ratio, or supported
width, the project's value wins and this lens records the difference as a
finding rather than silently applying its own default. This lens supplies a
floor, not a policy.

Its thresholds are dated. Past the `review_after` above, record `LENS STALE`
and re-verify against the source before quoting a number — a confidently
cited superseded threshold is worse than an admitted gap.

## Hands off

Does not own: whether the journey itself is the right one or can be completed
(Experience owns that), visual craft and design-system consistency (the
`ui-finish` lens), platform-specific accessibility APIs and their lifecycle
behavior (a platform lens such as `android`), legal or procurement
conformance obligations, or the final delivery verdict (Verifier).
