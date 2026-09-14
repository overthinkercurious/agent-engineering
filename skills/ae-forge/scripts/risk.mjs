const TIER_RANK = { light: 0, standard: 1, deep: 2 }
const BLAST_RANK = { isolated: 0, component: 1, cross_system: 2 }
const IRREVERSIBILITY_RANK = { reversible: 0, costly: 1, irreversible: 2 }
const SENSITIVITY_RANK = { none: 0, data: 1, security: 2 }
const UNCERTAINTY_RANK = { low: 0, medium: 1, high: 2 }

const SECURITY = new Set(['security', 'auth', 'authorization', 'tenant', 'secret', 'privacy', 'payment'])
const DATA = new Set(['data', 'database', 'schema', 'migration', 'backfill'])
const CROSS_SYSTEM = new Set(['external', 'integration', 'distributed', 'cross-system'])
const UNCERTAIN = new Set(['ambiguous', 'unknown', 'intermittent', 'flaky'])
const COSTLY = new Set(['migration', 'backfill', 'release'])

function highest(current, candidate, rank) {
  return rank[candidate] > rank[current] ? candidate : current
}

function normalize(values) {
  return [...new Set((values || []).map((value) => String(value).trim().toLowerCase()).filter(Boolean))].sort()
}

function choice(value, allowed, label) {
  if (!value) return null
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`)
  return value
}

export function assessRisk(options) {
  const kind = String(options.kind || '').toLowerCase()
  const signals = normalize(options.signals)
  const affectedBehaviors = normalize(options.affectedBehaviors)
  const interfaces = normalize(options.interfaces)
  const tokens = new Set([kind, ...signals, ...affectedBehaviors, ...interfaces])
  const diffText = String(options.diffText || '')
  const diffPaths = normalize(options.diffPaths)
  const filenameLeads = diffPaths.filter((path) => /(?:auth|security|tenant|secret|privacy|payment|migration|schema|database|api|route)/i.test(path))

  let blastRadius = 'isolated'
  let irreversibility = 'reversible'
  let sensitivity = 'none'
  let uncertainty = 'low'
  let crossSystemScope = false
  const reasons = []

  if ([...tokens].some((token) => SECURITY.has(token)) || /^\+.*\b(auth|authorization|permission|tenant|secret|privacy|payment)\b/im.test(diffText)) {
    sensitivity = 'security'; reasons.push('security-sensitive behavior is explicitly signaled or changed in the completed diff')
  } else if ([...tokens].some((token) => DATA.has(token)) || /^\+.*\b(database|schema|record|transaction)\b/im.test(diffText)) {
    sensitivity = 'data'; reasons.push('data-sensitive behavior is explicitly signaled or changed in the completed diff')
  }
  if ([...tokens].some((token) => CROSS_SYSTEM.has(token)) || /^\+.*\b(fetch|https?:|webhook|external|integration)\b/im.test(diffText)) {
    blastRadius = 'cross_system'; crossSystemScope = true; reasons.push('cross-system behavior is explicitly signaled or changed in the completed diff')
  } else if (tokens.has('api') || tokens.has('feature') || tokens.has('schema') || /^\+.*\b(export|route|endpoint|schema)\b/im.test(diffText)) {
    blastRadius = 'component'; reasons.push('a component interface is explicitly signaled or changed in the completed diff')
  }
  if (tokens.has('irreversible') || /^\+.*\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/im.test(diffText)) {
    irreversibility = 'irreversible'; reasons.push('an irreversible operation is explicitly signaled or changed in the completed diff')
  } else if ([...tokens].some((token) => COSTLY.has(token)) || /^\+.*\b(ALTER\s+TABLE|migration|backfill)\b/im.test(diffText)) {
    irreversibility = 'costly'; reasons.push('a costly-to-reverse operation is explicitly signaled or changed in the completed diff')
  }
  if ([...tokens].some((token) => UNCERTAIN.has(token))) {
    uncertainty = 'high'; reasons.push('material uncertainty is explicitly signaled')
  }

  const explicit = options.explicit || {}
  const explicitBlast = choice(explicit.blast_radius, Object.keys(BLAST_RANK), 'blast radius')
  const explicitIrreversibility = choice(explicit.irreversibility, Object.keys(IRREVERSIBILITY_RANK), 'irreversibility')
  const explicitSensitivity = choice(explicit.sensitivity, Object.keys(SENSITIVITY_RANK), 'sensitivity')
  const explicitUncertainty = choice(explicit.uncertainty, Object.keys(UNCERTAINTY_RANK), 'uncertainty')
  if (explicitBlast) blastRadius = highest(blastRadius, explicitBlast, BLAST_RANK)
  if (explicitIrreversibility) irreversibility = highest(irreversibility, explicitIrreversibility, IRREVERSIBILITY_RANK)
  if (explicitSensitivity) sensitivity = highest(sensitivity, explicitSensitivity, SENSITIVITY_RANK)
  if (explicitUncertainty) uncertainty = highest(uncertainty, explicitUncertainty, UNCERTAINTY_RANK)
  if (explicit.cross_system) { crossSystemScope = true; blastRadius = 'cross_system' }
  if (Object.values(explicit).some(Boolean)) reasons.push('explicit risk dimensions may raise but never lower inferred risk')

  let classifiedTier = 'light'
  if (blastRadius === 'cross_system' || irreversibility === 'irreversible' || sensitivity === 'security' || uncertainty === 'high' || kind === 'security') classifiedTier = 'deep'
  else if (blastRadius === 'component' || irreversibility === 'costly' || sensitivity === 'data' || uncertainty === 'medium' || ['feature', 'performance', 'audit'].includes(kind)) classifiedTier = 'standard'
  const policyFloor = choice(options.policyFloor || 'light', Object.keys(TIER_RANK), 'policy tier')
  let effectiveTier = highest(classifiedTier, policyFloor, TIER_RANK)
  if (options.previousTier) effectiveTier = highest(effectiveTier, choice(options.previousTier, Object.keys(TIER_RANK), 'previous tier'), TIER_RANK)
  reasons.push(`effective tier is max(classified ${classifiedTier}, policy floor ${policyFloor}${options.previousTier ? `, previous ${options.previousTier}` : ''})`)
  if (filenameLeads.length) reasons.push('filename matches are recorded as leads only and do not change the tier')

  const specialists = []
  const lenses = []
  if (sensitivity === 'security') { specialists.push('vault'); lenses.push('threat') }
  if (tokens.has('auth') || tokens.has('authorization') || tokens.has('tenant')) lenses.push('tenancy')
  if (sensitivity === 'data') lenses.push('integrity')
  if (tokens.has('migration') || tokens.has('backfill') || irreversibility !== 'reversible') { specialists.push('shift'); lenses.push('migrate', 'recover') }
  if (crossSystemScope) { specialists.push('spine', 'signal'); lenses.push('compat', 'failure', 'observe') }
  if (tokens.has('performance')) { specialists.push('signal'); lenses.push('speed') }

  return {
    source: options.source || 'intake',
    candidate_identity: options.candidateIdentity || null,
    inputs: {
      kind,
      explicit_signals: signals,
      affected_behaviors: affectedBehaviors,
      interfaces,
      diff_paths: diffPaths,
      diff_sha256: options.diffSha256 || null,
      filename_leads: filenameLeads,
      explicit_dimensions: {
        blast_radius: explicitBlast,
        irreversibility: explicitIrreversibility,
        sensitivity: explicitSensitivity,
        uncertainty: explicitUncertainty,
        cross_system: Boolean(explicit.cross_system),
      },
    },
    dimensions: { blast_radius: blastRadius, irreversibility, sensitivity, uncertainty, cross_system_scope: crossSystemScope },
    classified_tier: classifiedTier,
    policy_floor: policyFloor,
    effective_tier: effectiveTier,
    tier_changed: Boolean(options.previousTier && options.previousTier !== effectiveTier),
    diagnosis_required: ['bug', 'performance'].includes(kind) || tokens.has('defect') || tokens.has('incident'),
    added_specialists: normalize(specialists),
    added_lenses: normalize(lenses),
    reasons: normalize(reasons),
  }
}

