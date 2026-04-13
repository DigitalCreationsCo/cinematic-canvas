import Link from "next/link"
import { cn } from '#/lib/utils'

interface UpdateCardProps {
  slug: string
  title: string
  date: string
  excerpt?: string
  className?: string
}

export function UpdateCard({ slug, title, date, excerpt, className }: UpdateCardProps) {
  return (
    <div className={cn("group relative flex flex-col space-y-2", className)}>
      {date && (
        <p className="text-xs font-mono font-normal tracking-wide text-muted-foreground uppercase">
          {new Date(date).toLocaleDateString()}
        </p>
      )}
      <Link href={`/updates/${slug}`} className="absolute inset-0">
        <span className="sr-only">View Update</span>
      </Link>
      <h2 className="text-2xl font-normal tracking-tight">{title}</h2>
      {excerpt && <p className="text-muted-foreground">{excerpt}</p>}
      <div className="flex-1" />
    </div>
  )
}
