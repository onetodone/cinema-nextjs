'use client'

import { useActionState, useState } from 'react'
import { isApiError } from '@/lib/api/errors'
import { errorMessage } from '@/lib/api/messages'
import { registerAccount, signIn } from '@/lib/auth/session'
import { runFormAction, type FormState } from '@/lib/forms'
import { MIN_PASSWORD_LENGTH, registerSchema } from '@/schemas/auth'
import { useFocusInvalidField } from '@/hooks/use-focus-invalid-field'
import { AuthCard, AuthSwitchLink } from '@/components/auth/auth-card'
import { FormMessage } from '@/components/auth/form-message'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Registration starts no session, so the account is signed in right after with the same credentials. Success needs
// no navigation here: the page's RedirectIfAuthenticated moves on once the session is there.
const registerAction = runFormAction(registerSchema, async ({ email, password }): Promise<FormState> => {
  try {
    await registerAccount(email, password)
  } catch (error) {
    if (isApiError(error) && error.code === 'EMAIL_TAKEN') {
      return { error: errorMessage(error), fieldErrors: { email: errorMessage(error) } }
    }
    throw error
  }
  try {
    await signIn(email, password)
  } catch (error) {
    // The account exists now; only the sign-in failed (a rate limit, a dropped connection).
    return { error: `Your account was created, but signing in failed: ${errorMessage(error)} Please sign in.` }
  }
  return { success: true }
})

export function RegisterForm() {
  // Controlled, so the values survive a failed submit (React resets uncontrolled forms after every action).
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, undefined)
  const formRef = useFocusInvalidField(state)
  const fieldErrors = state?.fieldErrors

  return (
    <AuthCard
      title="Create an account"
      description="Book seats, pay, and keep your tickets in one place."
      footer={
        <p>
          Already have an account? <AuthSwitchLink page="/login">Sign in</AuthSwitchLink>
        </p>
      }
    >
      <form ref={formRef} action={action} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(fieldErrors?.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <FieldContent>
              <Input
                id="email"
                name="email"
                type="email"
                className="h-10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors?.email)}
                aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
              />
              {fieldErrors?.email ? <FieldError id="email-error">{fieldErrors.email}</FieldError> : null}
            </FieldContent>
          </Field>
          <Field data-invalid={Boolean(fieldErrors?.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <FieldContent>
              <Input
                id="password"
                name="password"
                type="password"
                className="h-10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors?.password)}
                aria-describedby={fieldErrors?.password ? 'password-error' : 'password-hint'}
              />
              {fieldErrors?.password ? (
                <FieldError id="password-error">{fieldErrors.password}</FieldError>
              ) : (
                <FieldDescription id="password-hint">At least {MIN_PASSWORD_LENGTH} characters.</FieldDescription>
              )}
            </FieldContent>
          </Field>
          {fieldErrors ? null : <FormMessage>{state?.error}</FormMessage>}
          <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
            {pending ? 'Creating your account…' : 'Create account'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
