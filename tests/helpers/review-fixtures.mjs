// Synthetic complete records for CLI contract tests, not behavioral evidence.
export function reviewResult(role, verdict = 'APPROVED') {
  const revise = verdict === 'REVISE'
  const detail = role === 'plan-reviewer'
    ? `### Re-verification log
| Citation | Re-read | Result |
|---|---|---|
| fixture plan | yes | checked in this test |

### Criteria
| # | Criterion | Result |
|---|---|---|
${['Citations', 'Cause', 'Reality', 'Invariants', 'Verifiable', 'Scope'].map((name, index) => `| ${index + 1} | ${name} | ${revise && index === 3 ? 'FAIL (F1)' : 'PASS'} |`).join('\n')}`
    : role === 'plan-challenger'
      ? '### Decision challenge log\n| Decision | Opposing case | Evidence | Result |\n|---|---|---|---|\n| fixture decision | failure case | fixture plan | checked |'
      : '### Gates re-run by me in this pass\n| Command | Source | Exit | Status |\n|---|---|---|---|\n| fixture gate | fixture | 0 | pass |\n\n### Acceptance → evidence\n| Criterion | Evidence | Verdict |\n|---|---|---|\n| fixture acceptance | fixture evidence | checked |'
  return `# ${role}

## STATUS
COMPLETE

## OUTCOME

### Verdict
${verdict}

${detail}

## EVIDENCE
| What | Where | How checked |
|---|---|---|
| fixture input | fixture artifact | read |

## FINDINGS
${revise ? '| ID | Severity | Location | Issue | Consequence | Smallest repair | Proof check |\n|---|---|---|---|---|---|---|\n| F1 | high | fixture plan | invalid invariant | wrong result | fix invariant | fixture check |' : 'none'}

## UNKNOWNS
none

## HANDOFF
Forge evaluates the next permitted step.
`
}
