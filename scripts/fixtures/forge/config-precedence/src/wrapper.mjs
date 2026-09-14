import { directConfig } from './direct.mjs'

export function wrapperConfig(store, request) {
  return directConfig(store.configuration, request.options)
}
