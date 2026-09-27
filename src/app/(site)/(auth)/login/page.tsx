import type { Metadata } from 'next'
import { AuthCardSkeleton } from '@/components/auth/auth-card'
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default function LoginPage() {
  return (
    <RedirectIfAuthenticated fallback={<AuthCardSkeleton />}>
      <LoginForm />
    </RedirectIfAuthenticated>
  )
}
