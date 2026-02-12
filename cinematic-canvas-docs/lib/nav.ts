export interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
}

export function buildDocsTree(docs: { slug: string[], frontmatter: any }[]): NavItem[] {
  const root: NavItem[] = []

  for (const doc of docs) {
    let currentLevel = root
    for (let i = 0; i < doc.slug.length; i++) {
      const part = doc.slug[i]
      const isLast = i === doc.slug.length - 1
      
      // Find node matching the current part
      // We check if href ends with the part (for existing docs) or title matches (for virtual nodes)
      // Note: This is imperfect if titles are changed to be very different from directory names, 
      // but for structure building it's a reasonable approximation without extra metadata.
      let node = currentLevel.find(n => {
          if (n.href) {
             const segments = n.href.split('/')
             return segments[segments.length - 1] === part
          }
          return n.title === part
      })
      
      if (!node) {
        node = {
          title: part, // Default to directory name, update later if doc exists
          items: []
        }
        currentLevel.push(node)
      }
      
      if (isLast) {
        node.href = `/docs/${doc.slug.join('/')}`
        if (doc.frontmatter.title) {
          node.title = doc.frontmatter.title
        }
      }
      
      if (!node.items) node.items = []
      currentLevel = node.items
    }
  }
  
  return root
}
