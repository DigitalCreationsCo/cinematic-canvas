import Link from 'next/link';
import { Button } from '#/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[86.5vh] flex-col items-center justify-center px-2 py-8 text-center">
      <h1 className="mb-4 text-4xl  sm:text-7xl font-heading">The Page Was Lost</h1>
      <p className="mb-8 max-w-150 text-foreground sm:text-base">We couldn't find what you're looking for.</p>
      <div className="flex items-center">
        {/* <Button variant="default" size="lg" asChild className="btn-cinematic"
        // onClick={ () => window?.history.back() }
        >
          Go back
        </Button> */}
      </div>
    </div>
  )
}
