'use client'

import { FlaskConicalIcon } from 'lucide-react'
import { LOCAL_TEST_TOKENS } from '@/lib/payments/local'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { PaymentMethodFormProps } from '@/components/checkout/payment-methods'

/**
 * The form of the API's local test provider: instead of card details, the viewer picks what the test card does.
 * The tokens are shown on purpose — this provider exists for development and demos only.
 */
export function LocalTestCard({ token, onTokenChange, disabled }: PaymentMethodFormProps) {
  return (
    <fieldset className="@container flex flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">What the test card does</legend>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <FlaskConicalIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>Test mode: no real money moves. Choose how this payment should go.</span>
      </p>
      <RadioGroup
        aria-label="What the test card does"
        value={token}
        onValueChange={(value) => onTokenChange(String(value))}
        disabled={disabled}
        className="grid gap-2 @md:grid-cols-2"
      >
        {LOCAL_TEST_TOKENS.map(({ token: value, label, description }) => (
          <FieldLabel key={value} htmlFor={`test-token-${value}`}>
            <Field orientation="horizontal">
              <RadioGroupItem value={value} id={`test-token-${value}`} />
              <FieldContent>
                <FieldTitle className="flex-wrap gap-x-2">
                  {label}{' '}
                  <code className="font-mono text-[0.6875rem] font-normal break-all text-muted-foreground">
                    {value}
                  </code>
                </FieldTitle>
                <FieldDescription className="text-xs">{description}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
