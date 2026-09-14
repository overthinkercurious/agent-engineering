export function resolveConfig(storedDefaults, requestOptions = {}) {
  // Seeded Alpha defect: stored values incorrectly overwrite explicit input.
  return { ...requestOptions, ...storedDefaults }
}
