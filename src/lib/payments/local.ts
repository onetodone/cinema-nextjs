// The API's local test provider (development only) takes these tokens instead of card details. The checkout lists
// them on purpose, so every payment outcome can be tried by hand.

export const LOCAL_METHOD_ID = 'local'

export interface TestToken {
  token: string
  label: string
  description: string
}

export const LOCAL_TEST_TOKENS: readonly TestToken[] = [
  { token: 'tok_success', label: 'Pays', description: 'The payment goes through at once.' },
  { token: 'tok_slow', label: 'Pays slowly', description: 'Goes through after about 5 seconds.' },
  { token: 'tok_declined', label: 'Declined', description: 'The bank declines the card.' },
  { token: 'tok_insufficient_funds', label: 'Insufficient funds', description: 'Declined: not enough money.' },
  { token: 'tok_expired_card', label: 'Expired card', description: 'Declined: the card has expired.' },
  { token: 'tok_unavailable', label: 'Provider down', description: 'The provider refuses the request.' },
  { token: 'tok_error', label: 'Provider error', description: 'No clear answer; settled within minutes.' },
  { token: 'tok_timeout', label: 'No answer', description: 'Times out after ~10 s; settled within minutes.' },
]

export const DEFAULT_TEST_TOKEN = 'tok_success'
