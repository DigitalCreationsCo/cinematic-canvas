'use client'

import { useEffect } from 'react'
import { Button } from '#/components/ui/button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="flex min-h-[99vh] flex-col items-start gap-3 px-2 p-8">
      <div>
        <h2 className="text-5xl font-heading">Something went wrong...</h2>
        <p className="text-muted-foreground">We're sorry, but something went wrong.</p>
      </div>
      <Button onClick={() => reset()} className="btn-cinematic">Try again</Button>
    </section>
  )
}
