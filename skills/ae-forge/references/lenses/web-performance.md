# Web performance lens (field metrics and their thresholds)

## Provenance

```yaml
metrics: Core Web Vitals - LCP, INP, CLS
note: INP replaced FID as the responsiveness metric in March 2024
verified: "2026-09-20 corewebvitals.io/core-web-vitals"
review_after: "2027-09-20"
```

Past `review_after`, record `LENS STALE` and re-verify before quoting a
threshold. This block exists because the opposite failure is silent: guidance
naming FID still circulates widely, and a confidently cited retired metric is
worse than an admitted gap.

## Exclusive constraint

Adds field-metric depth to Reliability's performance boundary and to
Experience's rendered acceptance: which metric describes the problem, what
counts as good, and what a measurement has to control for before it means
anything. It does not own server-side capacity or dependency resilience —
Reliability keeps those generically.

## Activates

Signals: `web-performance`, `core-web-vitals`, `lcp`, `inp`, `cls`, `bundle`,
`lighthouse`, `page-load`, `hydration`, or a `runtime` risk on a change with a
rendered surface.

Skip for a backend-only change, and for a rendered change with no plausible
effect on load, interaction latency, or layout stability — say so rather than
producing an unmeasured verdict.

## Thresholds

Quote these only while the provenance block is current. All are measured at
the **75th percentile of real users**, not on a developer machine.

| Metric | Good | Needs improvement | Poor |
|---|---|---|---|
| LCP — largest contentful paint | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| INP — interaction to next paint | ≤ 200ms | 200–500ms | > 500ms |
| CLS — cumulative layout shift | ≤ 0.1 | 0.1–0.25 | > 0.25 |

INP observes **every** interaction and reports the worst, through to the next
paint — so a single slow handler on a rarely-used control can fail it while an
average looks healthy.

## Checklist

**Frame the measurement first (Reliability)**

1. Name the metric that matches the complaint before profiling. "Slow" is not
   a metric; a janky button is INP, a late hero image is LCP, content jumping
   under the cursor is CLS.
2. Establish a baseline under stated conditions — device class, network,
   cold or warm cache, and data volume — and re-measure the candidate under
   the identical conditions. A comparison across different conditions is not
   evidence.
3. Prefer field data where the project has it. Lab data is reproducible and
   unrepresentative; both are useful, and conflating them is not.

**Loading (Reliability, Experience)**

4. Identify the actual LCP element before optimising anything. Work that does
   not touch it will not move the metric.
5. Check render-blocking resources, unpreloaded critical fonts and images, and
   whether the LCP resource is discoverable in the initial HTML rather than
   only after script execution.
6. Check payload growth this change introduces: a new dependency, an
   unsplit route, an uncompressed asset, or an image served larger than its
   rendered size.

**Interaction (Reliability, Experience)**

7. Check for long tasks on the main thread during interaction — a handler that
   does layout, parsing, or large synchronous work before yielding.
8. Check that the visual response to an interaction is not gated behind the
   whole state update; INP measures through to the paint, not to the handler
   returning.

**Stability (Experience)**

9. Check that images, embeds, and ad or banner slots reserve their space
   before loading.
10. Check that late-inserted content — banners, consent layers, async
    validation messages — does not displace content the user is already
    reading.
11. Check that a web font swap does not reflow the surrounding text.

## Evidence

A Lighthouse score is not a Core Web Vitals pass: it is a lab approximation of
three field metrics plus unrelated audits. Report the metric, the value, the
percentile, and the conditions. A single number with no conditions attached is
not a performance claim.

## Findings

Every finding names the metric it affects, the measured before and after, and
the conditions both were taken under. A recommendation with no measurement is
a hypothesis and must be labelled as one.

## Authority

This lens narrows what a role must check; it never outranks the project's own
documented performance budget, its declared device baseline, or an enforced
gate. Where the project sets a stricter budget, the project wins. Where it
sets a looser one, record the difference rather than silently adopting either.

## Hands off

Does not own: server-side capacity, queueing, and dependency resilience
(Reliability owns those generically), database query performance (the
`database-performance` lens), visual craft and design-system consistency
(`ui-finish`), accessibility conformance (`accessibility`), or the final
delivery verdict (Verifier).
