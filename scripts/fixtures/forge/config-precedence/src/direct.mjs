import { resolveConfig } from './config.mjs'

export function directConfig(storedDefaults, requestOptions) {
  return resolveConfig(storedDefaults, requestOptions)
}
