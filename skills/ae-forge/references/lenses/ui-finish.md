# UI finish lens (visual craft and design-system depth)

## Exclusive constraint

Adds visual-craft and design-system depth that the generic roles don't own:
layout composition, spacing/typography scale, component consistency, and
interaction-state visual polish. Attaches to Experience (visual-craft
acceptance criteria alongside its journey/state ownership), Architect
(component/design-system boundary decisions), and Builder (implementation
against the design system).

## Activates

Signals: `design-system`, `visual`, `layout`, `spacing`, `typography`,
`polish`, `component-library`, `theming`, `pixel`, `icon-system`, or a
detected design-token/theme config in the sensor dump (a tokens file, a
Tailwind/style-dictionary config, a Storybook config, when a survey exists).

Skip when the change has no rendered visual surface. When the project has no
established design system and the change is a one-off internal tool, record
that as a finding rather than inventing a system to check against.

## Checklist

**Design (Experience, Architect)**

1. Identify the project's actual design-system source of truth (tokens,
   theme file, component library) before proposing values — a spacing or
   color value not backed by the existing scale is a defect, not craft.
2. State which existing component the new UI should reuse or extend before
   designing a new one — an unnecessary new component duplicates design
   debt the project will carry indefinitely.
3. Define the visual states this change must cover beyond the happy path:
   hover/focus/active, disabled, loading, error, empty, and dark/light theme
   if the project supports both.
4. For a new layout, state the grid/spacing unit it aligns to and how it
   behaves at the narrowest and widest supported viewport, not just the
   primary design width.

**Implementation (Builder)**

5. Use design tokens or theme variables rather than hardcoded values (hex
   colors, magic pixel numbers) unless the project genuinely has no token
   system — note that gap as a finding rather than silently working around it.
6. Check typography follows the established scale (size/weight/line-height
   combinations) rather than an ad hoc override.
7. Match spacing to the project's spacing scale (for example a 4/8px grid)
   rather than arbitrary margin/padding values.
8. Verify icon or asset usage matches the existing icon system's size,
   stroke weight, and naming convention rather than importing a one-off asset.

**Verification (Experience, Verifier)**

9. Render the change at the narrowest supported width and at the largest
   text-scale setting the project supports — a design evidenced only at the
   reference viewport is not evidenced.
10. Compare the result against the existing design system: does it read as
    the same product, or as a different design skinned onto this one?
11. Confirm every visual state named in step 3 was actually exercised during
    verification, not just described in the plan.

## Authority

This lens narrows what a role must check; it never outranks the project's
own documented conventions, design system, or an enforced gate. When this
lens's guidance conflicts with the project's own docs or a passing project
check, the project wins — record the conflict as a finding rather than
silently overriding the project's convention with this lens's default.

## Hands off

Does not own: whether the interaction or journey itself is correct or
accessible at the semantic level (Experience owns that generically — this
lens only adds the visual-craft layer on top), backend or data implementation,
or platform-specific rendering behavior (a platform lens, such as `android`,
owns that when both apply; this lens and a platform lens may attach to the
same role together, up to the two-lens cap).
