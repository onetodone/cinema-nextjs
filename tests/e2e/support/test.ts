import { test as base, expect, type BrowserContext } from '@playwright/test'

// The specs' `test`: like Playwright's, but files from other hosts — the seed's poster URLs point at a third-party
// image service — are answered locally with a blank image. The specs then never wait on (or fail with) a host they
// do not test, and pages still show their posters' frames.

const BLANK_POSTER = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"/>'

/** Answers every request to another origin than the app's with a blank image. Use it on contexts a spec creates. */
export async function stubThirdParty(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  const origin = new URL(baseURL ?? 'http://localhost').origin
  await context.route(
    (url) => url.protocol.startsWith('http') && url.origin !== origin,
    (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: BLANK_POSTER }),
  )
}

export const test = base.extend({
  // The fixture callback is Playwright's `use` (renamed: the React hooks lint rule claims that name).
  context: async ({ context, baseURL }, provide) => {
    await stubThirdParty(context, baseURL)
    await provide(context)
  },
})

export { expect }
