'use client'

import type { ComponentType } from 'react'
import { CreditCardIcon } from 'lucide-react'
import type { PaymentMethod } from '@/lib/api/types'
import { DEFAULT_TEST_TOKEN, LOCAL_METHOD_ID } from '@/lib/payments/local'
import { LocalTestCard } from '@/components/checkout/local-test-card'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

// The payment-method registry: what this client can show for each method id the API may enable (it mirrors the
// API's provider registry). A method the API enables but this client does not know is listed as unsupported,
// never with a raw token field. Adding a provider (a card form, a wallet button) means one entry here.

export interface PaymentMethodFormProps {
  /** The payment token the form has produced so far. */
  token: string
  onTokenChange: (token: string) => void
  disabled: boolean
}

interface PaymentMethodEntry {
  /** The token the form starts with ('' when the viewer must fill something in first). */
  initialToken: string
  Form: ComponentType<PaymentMethodFormProps>
}

const REGISTRY: Record<string, PaymentMethodEntry> = {
  [LOCAL_METHOD_ID]: { initialToken: DEFAULT_TEST_TOKEN, Form: LocalTestCard },
}

export function paymentMethodEntry(methodId: string): PaymentMethodEntry | null {
  return Object.hasOwn(REGISTRY, methodId) ? REGISTRY[methodId] : null
}

/** The first method of the list that this client can take payments with. */
export function firstSupportedMethod(methods: readonly PaymentMethod[]): PaymentMethod | null {
  return methods.find((method) => paymentMethodEntry(method.id) !== null) ?? null
}

/**
 * The payment methods to choose from, and the form of the chosen one. With a single method there is nothing to
 * choose: it is named as the way to pay.
 */
export function PaymentMethodPicker({
  methods,
  methodId,
  onMethodChange,
  token,
  onTokenChange,
  disabled,
}: {
  methods: readonly PaymentMethod[]
  methodId: string | null
  onMethodChange: (methodId: string) => void
  token: string
  onTokenChange: (token: string) => void
  disabled: boolean
}) {
  const entry = methodId === null ? null : paymentMethodEntry(methodId)
  const single = methods.length === 1

  return (
    <div className="flex flex-col gap-4">
      {single ? (
        <p className="flex items-center gap-2 text-sm">
          <CreditCardIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          Pay with <span className="font-medium">{methods[0].name}</span>
          {entry ? null : <span className="text-muted-foreground">(not supported by this app)</span>}
        </p>
      ) : (
        <RadioGroup
          aria-label="Payment method"
          value={methodId ?? ''}
          onValueChange={(value) => onMethodChange(String(value))}
          disabled={disabled}
        >
          {methods.map((method) => {
            const supported = paymentMethodEntry(method.id) !== null
            return (
              <FieldLabel key={method.id} htmlFor={`payment-method-${method.id}`}>
                <Field orientation="horizontal" data-disabled={!supported || undefined}>
                  <RadioGroupItem value={method.id} id={`payment-method-${method.id}`} disabled={!supported} />
                  <FieldContent>
                    <FieldTitle>{method.name}</FieldTitle>
                    {supported ? null : <FieldDescription>Not supported by this app yet.</FieldDescription>}
                  </FieldContent>
                </Field>
              </FieldLabel>
            )
          })}
        </RadioGroup>
      )}
      {entry ? <entry.Form token={token} onTokenChange={onTokenChange} disabled={disabled} /> : null}
    </div>
  )
}
