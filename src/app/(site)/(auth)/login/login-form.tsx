'use client'

import { useActionState, useState } from 'react'
import { signIn } from '@/lib/auth/session'
import { runFormAction, type FormState } from '@/lib/forms'
import { loginSchema } from '@/schemas/auth'
import { useFocusInvalidField } from '@/hooks/use-focus-invalid-field'
import { AuthCard, AuthSwitchLink } from '@/components/auth/auth-card'
import { FormMessage } from '@/components/auth/form-message'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Success needs no navigation here: the page's RedirectIfAuthenticated moves on once the session is there.
const loginAction = runFormAction(loginSchema, async ({ email, password }): Promise<FormState> => {
  await signIn(email, password)
  return { success: true }
})

export function LoginForm() {
  // Controlled, so the values survive a failed submit (React resets uncontrolled forms after every action).
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined)
  const formRef = useFocusInvalidField(state)
  const fieldErrors = state?.fieldErrors

  return (
    <AuthCard
      title="Sign in"
      description="Sign in to hold seats and see your tickets."
      footer={
        <p>
          New here? <AuthSwitchLink page="/register">Create an account</AuthSwitchLink>
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
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors?.password)}
                aria-describedby={fieldErrors?.password ? 'password-error' : undefined}
              />
              {fieldErrors?.password ? <FieldError id="password-error">{fieldErrors.password}</FieldError> : null}
            </FieldContent>
          </Field>
          {fieldErrors ? null : <FormMessage>{state?.error}</FormMessage>}
          <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
