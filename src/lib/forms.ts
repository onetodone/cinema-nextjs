import type * as z from 'zod/mini'
import { isApiError } from '@/lib/api/errors'
import { errorMessage, errorReference } from '@/lib/api/messages'

/** What a form shows after a submit: a form-level message, messages per field (by input name), or success. */
export type FormState = { error?: string; fieldErrors?: Record<string, string>; success?: boolean } | undefined

export function zodFieldErrors(error: z.core.$ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map((segment) => String(segment)).join('.') || '_'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

/** "password", "must be at least 8 characters" → "Password must be at least 8 characters." */
function fieldSentence(field: string, message: string): string {
  const name = field.replaceAll('_', ' ')
  const sentence = name ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${message}` : message
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

/**
 * A failed call as form state. The API's `errors[].field` (400 VALIDATION_FAILED) become field errors, keyed by the
 * field name, which the forms use as input names; failures that are the server's fault carry their request id.
 */
export function toFormState(error: unknown): FormState {
  const reference = errorReference(error)
  const message = reference ? `${errorMessage(error)} (Reference: ${reference})` : errorMessage(error)
  if (isApiError(error) && error.fieldErrors.length > 0) {
    const fieldErrors: Record<string, string> = {}
    for (const { field, message: fieldMessage } of error.fieldErrors) {
      const key = field || '_'
      if (!(key in fieldErrors)) fieldErrors[key] = fieldSentence(field, fieldMessage)
    }
    return { error: message, fieldErrors }
  }
  return { error: message }
}

/**
 * A `useActionState` action: validates the form with `schema`, then runs `handler`. Validation failures and thrown
 * errors come back as form state, so the action never throws.
 */
export function runFormAction<Schema extends z.ZodMiniType>(
  schema: Schema,
  handler: (values: z.infer<Schema>) => Promise<FormState>,
): (prevState: FormState, formData: FormData) => Promise<FormState> {
  return async (_prevState, formData) => {
    const parsed = schema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? 'Please check the form.',
        fieldErrors: zodFieldErrors(parsed.error),
      }
    }
    try {
      return await handler(parsed.data)
    } catch (error) {
      return toFormState(error)
    }
  }
}
