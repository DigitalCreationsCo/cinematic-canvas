'use client'

import MermaidClient from '#/components/markdown/mermaid'

export default function MermaidWrapper(props: { chart: string; className?: string }) {
  return <MermaidClient {...props} />
}
