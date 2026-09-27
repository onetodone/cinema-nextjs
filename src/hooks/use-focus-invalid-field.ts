import { useEffect, useRef } from 'react'
import type { FormState } from '@/lib/forms'

/**
 * After a submit that came back with field errors, moves focus to the first invalid input, so keyboard and screen
 * reader users land on what needs fixing. Attach the returned ref to the form.
 */
export function useFocusInvalidField(state: FormState) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state?.fieldErrors) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [state])

  return formRef
}
