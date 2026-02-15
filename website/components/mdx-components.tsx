import { cn } from "@/lib/utils"
import Link from "next/link"

function Tabs({ children, className, defaultValue }: { children: React.ReactNode; className?: string; defaultValue?: string }) {
  return (
    <div className={cn("my-4 rounded-md border p-4", className)}>
      {children}
    </div>
  )
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex space-x-2 border-b mb-4", className)}>
      {children}
    </div>
  )
}

function TabsTrigger({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) {
  return (
    <div className={cn("px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-default", className)}>
      {children}
    </div>
  )
}

function TabsContent({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) {
  return (
    <div className={cn("mt-2", className)}>
      <div className="text-xs text-muted-foreground mb-1 font-mono uppercase">
        {value}
      </div>
      {children}
    </div>
  )
}

function Card({ title, description, href, children, className }: { title: string; description?: string; href?: string; children?: React.ReactNode; className?: string }) {
  const content = (
    <div className={cn("rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-all hover:shadow-md", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      {children}
    </div>
  )
  
  if (href) {
    return <Link href={href} className="no-underline block h-full">{content}</Link>
  }
  
  return content
}

function CardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col space-y-4 border-l pl-4 ml-2 my-4">
      {children}
    </div>
  )
}

function StepItem({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
       {title && <h4 className="font-semibold">{title}</h4>}
       <div>{children}</div>
    </div>
  )
}

function Note({ children, title = 'Note', type = 'note' }: { children: React.ReactNode; title?: string; type?: string }) {
  return (
    <div className={cn("my-4 rounded-md border px-4 py-3 text-sm", 
      type === 'warning' ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : 
      type === 'danger' ? "border-red-500 bg-red-50 dark:bg-red-900/20" : 
      "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
    )}>
      <div className="font-bold mb-1">{title}</div>
      {children}
    </div>
  )
}

function FileTree({ children }: { children: React.ReactNode }) {
    return (
        <div className="my-4 rounded-md border bg-muted p-4 font-mono text-sm">
            {children}
        </div>
    )
}

function Mermaid({ chart }: { chart: string }) {
  return (
    <div className="my-4 rounded-md border bg-muted p-4">
      <div className="font-mono text-xs mb-2">Mermaid Diagram</div>
      <pre className="text-xs overflow-auto">{chart}</pre>
    </div>
  )
}

function File({ name, label }: { name?: string; label?: string }) {
  return <div className="pl-4 border-l ml-2 py-1 flex items-center gap-2">📄 {label || name}</div>
}

function Folder({ name, label, children }: { name?: string; label?: string; children?: React.ReactNode }) {
  return (
    <div className="pl-4 border-l ml-2 py-1">
      <div className="flex items-center gap-2 font-bold">📁 {label || name}</div>
      <div className="ml-2">{children}</div>
    </div>
  )
}

function Highlight({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span 
      className="px-1 py-0.5 rounded-sm bg-yellow-100 dark:bg-yellow-900/40"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
    return <div className="space-y-4">{children}</div>
}

export const components = {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardGrid,
  Cards: CardGrid, // Alias
  Step,
  StepItem,
  Steps, // Alias? Check usage
  Note,
  Callout: Note, // Alias
  FileTree,
  Mermaid,
  Highlight,
  File,
  Folder
}
