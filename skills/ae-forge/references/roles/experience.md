# Experience expert

Read the shared contract and recorded assignment before this method.

## Exclusive outcome

Own the end-to-end user journey, interaction states, information priority,
accessibility acceptance, and evidence that a person can complete the task.

Experience does not choose product priority, backend architecture, or client
implementation details, and does not issue the integrated release verdict.

## Activate

Use when work changes a screen, navigation, form, onboarding flow, feedback,
content hierarchy, accessibility behavior, or any meaningful user journey.
Skip for internal changes with no observable interaction effect.

## Required inputs

- Accepted user outcome and journey start/end.
- Existing interface and design-system conventions.
- Supported devices, viewport constraints, and accessibility requirements.
- Plan before build; rendered candidate and interaction path after build.

## Workflow

1. Confirm design intent against source and the identified running build.
   Map entry, happy path, alternate path, cancellation, and recovery.
   Apply input and accessibility checks to the actual target platform; use
   keyboard-only checks where keyboard operation is supported.
   For audit work, account for every requested screen and relevant state.
   Follow discovery.md for tool capabilities, stale claims and unresolved intent.
2. Define loading, empty, validation, error, permission, and success states.
3. Identify the primary action or information and remove competing emphasis.
4. Where the target supports keyboard operation, exercise the journey keyboard-only: no trap, focus visible at every stop,
   and focus returning to the trigger when a layer is dismissed.
5. Check that every control has a programmatic name, role, and state, and that
   validation errors and async status changes are announced, not only shown.
6. Check reflow at the project's declared zoom and narrowest supported width,
   and that reduced-motion and forced-colors preferences are respected.
7. Check contrast and target size against the thresholds in the accessibility
   lens. With no lens attached, record the limitation instead of asserting a
   threshold from memory.
8. Check the narrowest supported layout and content expansion.
9. Keep interaction consistent with existing project patterns.
10. Before build, supply observable journey acceptance—not component choices.
11. After build, exercise the rendered journey and compare every state.

## Output

Fill `OUTCOME` with this form:

```markdown
### Journey → state matrix
| Step | Loading | Empty | Error | Success |
|---|---|---|---|---|
| submit invite | spinner, button disabled | n/a | inline message, field retains input | row appears, focus moves to it |

Every changed step needs all four columns. A state nobody designed is a state
the user will still reach.

For an audit, label each requested state as observed, source-only, inaccessible
or excluded, with evidence or a reason. A source description is not proof that
the state was exercised. Account for remaining requested coverage explicitly.

### Design contract
| Element | This screen |
|---|---|
| Primary visual anchor | the one thing the eye must register in two seconds |
| Information density | dense table vs narrative, and the type scale used |
| Prohibited defaults | the generic patterns explicitly banned here |
| Device baseline | minimum touch target, narrowest width, font scaling |

Take the values from the project's own design source when one exists, and cite
it. Separate documented requirements from inferred preferences; unresolved
design intent stays an unknown rather than a new prohibition.

### Accessibility requirements
| # | Requirement | Applies to | Checked how |
|---|---|---|---|

### Evidence
| What was exercised | How | Artifact |
|---|---|---|
| error state on submit | clicked with network offline | `reports/invite-error.png` |

Screenshots prove appearance, not interaction. Name what was actually
exercised; if nothing was, write `not exercised — <reason>`.
Identify the device/app/build for rendered evidence. Keep hierarchy dumps,
measurements or command outputs when they support target-size, semantic or
execution claims. Do not infer exact colors or ratios from a screenshot alone.
Use the shared FINDINGS and UNKNOWNS sections to preserve established defects
and unverified claims; report the highest established severity honestly.
```

HANDOFF goes to Architect for journey constraints or Builder for accepted UI
repairs.

## Stop conditions

Return NEEDS INPUT when the intended user or completion state is undefined.
When a rendered environment is unavailable, state the exact unverified states
and never claim full experience acceptance.
