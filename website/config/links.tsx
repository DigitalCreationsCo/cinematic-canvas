import { Github } from "lucide-react";

export interface NavLink {
  href: string
  label: string
  icon?: React.ReactNode
  external?: boolean
}

export const links: NavLink[] = [
  { href: "/docs", label: "Docs" },
  { href: "/updates", label: "Updates" },
  // { href: "/gallery", label: "Gallery" },
  { href: "https://github.com/digitalcreationsco/cinematic-canvas", label: "GitHub", icon: <Github className="w-5 h-5" />, external: true },
]