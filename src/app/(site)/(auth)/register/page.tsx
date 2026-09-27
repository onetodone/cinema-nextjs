import type { Metadata } from 'next'
import { AuthCardSkeleton } from '@/components/auth/auth-card'
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated'
import { RegisterForm } from './register-form'

export const metadata: Metadata = {
  title: 'Create an account',
}

export default function RegisterPage() {
  return (
    <RedirectIfAuthenticated fallback={<AuthCardSkeleton />}>
      <RegisterForm />
    </RedirectIfAuthenticated>
  )
}
