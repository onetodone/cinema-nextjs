import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { describe, expect, it } from 'vitest'
import { ThemeToggle } from '@/components/layout/theme-toggle'

describe('ThemeToggle', () => {
  it('switches the document between dark and light', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>,
    )
    const button = screen.getByRole('button', { name: 'Toggle theme' })

    await user.click(button)
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')

    await user.click(button)
    expect(document.documentElement).toHaveClass('dark')
  })
})
