import createClient from 'openapi-fetch'
import type { paths } from '@/lib/api/schema'

// Browser client for the public catalog. Requests go to this origin's /v1 proxy (never to the API origin: the CSP's
// `connect-src 'self'` would block that). It sends no credentials; the auth-aware client joins it with sign-in.
//
// The base URL is this page's origin rather than '' because the Fetch API outside browsers (tests) cannot resolve
// relative URLs. The module is evaluated during server rendering too, where it is never called.
export const publicApi = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  // Looked up per call rather than captured at import, so wrappers installed later (test interceptors) apply.
  fetch: (request) => globalThis.fetch(request),
})
