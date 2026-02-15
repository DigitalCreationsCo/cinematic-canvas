import fs from "fs"
import path from "path"
import matter from "gray-matter"

const DOCS_PATH = path.join(process.cwd(), "content/docs")
const UPDATES_PATH = path.join(process.cwd(), "content/updates")

export async function getDocsSlugs() {
  // Helper to recursively get all slugs
  function getFiles(dir: string): string[] {
    const dirents = fs.readdirSync(dir, { withFileTypes: true })
    const files = dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name)
      return dirent.isDirectory() ? getFiles(res) : res
    })
    return Array.prototype.concat(...files)
  }
  
  const files = getFiles(DOCS_PATH)
  
  return files
    .filter((filePath) => filePath.endsWith(".mdx") || filePath.endsWith(".md"))
    .map((filePath) => {
      const relativePath = path.relative(DOCS_PATH, filePath)
      return relativePath.replace(/\.mdx?$/, "").split(path.sep)
    })
}

export async function getDocBySlug(slug: string[]) {
  const realSlug = slug.join(path.sep)
  let filePath = path.join(DOCS_PATH, `${realSlug}.mdx`)
  
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DOCS_PATH, `${realSlug}.md`)
  }

  // Handle index files (e.g. slug: ['architecture'] -> architecture/index.mdx)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DOCS_PATH, realSlug, "index.mdx")
  }
   if (!fs.existsSync(filePath)) {
    filePath = path.join(DOCS_PATH, realSlug, "index.md")
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Doc not found for slug: ${slug.join("/")}`)
  }

  const fileContents = fs.readFileSync(filePath, "utf8")
  const { data, content } = matter(fileContents)
  
  return {
    slug,
    frontmatter: data,
    content, 
  }
}

export async function getAllDocs() {
  const slugs = await getDocsSlugs()
  const docs = await Promise.all(slugs.map((slug) => getDocBySlug(slug)))
  return docs
}

export async function getUpdatesSlugs() {
  const files = fs.readdirSync(UPDATES_PATH)
  return files
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
    .map((file) => file.replace(/\.mdx?$/, ""))
}

export async function getUpdateBySlug(slug: string) {
  let filePath = path.join(UPDATES_PATH, `${slug}.mdx`)
    if (!fs.existsSync(filePath)) {
    filePath = path.join(UPDATES_PATH, `${slug}.md`)
  }
  
  const fileContents = fs.readFileSync(filePath, "utf8")
  const { data, content } = matter(fileContents)

  return {
    slug,
    frontmatter: data,
    content,
  }
}

export async function getAllUpdates() {
  const slugs = await getUpdatesSlugs()
  const updates = await Promise.all(slugs.map((slug) => getUpdateBySlug(slug)))
  return updates.sort((a, b) => {
    // Sort updates by date descending (assuming date in frontmatter or filename)
    // For now, simple filename sort descending
    return b.slug.localeCompare(a.slug)
  })
}
