import fs from "fs/promises"
import path from "path"
import matter from "gray-matter"

const DOCS_PATH = path.join(process.cwd(), "content/docs")
const UPDATES_PATH = path.join(process.cwd(), "content/updates")

export async function getDocsSlugs() {
  async function getFiles(dir: string): Promise<string[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const dirent of dirents) {
      const res = path.resolve(dir, dirent.name)
      if (dirent.isDirectory()) {
        files.push(...await getFiles(res))
      } else {
        files.push(res)
      }
    }
    return files
  }
  
  const files = await getFiles(DOCS_PATH)
  
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
  
  try {
    await fs.access(filePath)
  } catch {
    filePath = path.join(DOCS_PATH, `${realSlug}.md`)
  }

  try {
    await fs.access(filePath)
  } catch {
    filePath = path.join(DOCS_PATH, realSlug, "index.mdx")
  }

  try {
    await fs.access(filePath)
  } catch {
    filePath = path.join(DOCS_PATH, realSlug, "index.md")
  }

  let fileContents: string
  try {
    fileContents = await fs.readFile(filePath, "utf8")
  } catch {
    throw new Error(`Doc not found for slug: ${slug.join("/")}`)
  }

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
  const files = await fs.readdir(UPDATES_PATH)
  return files
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
    .map((file) => file.replace(/\.mdx?$/, ""))
}

export async function getUpdateBySlug(slug: string) {
  let filePath = path.join(UPDATES_PATH, `${slug}.mdx`)
  try {
    await fs.access(filePath)
  } catch {
    filePath = path.join(UPDATES_PATH, `${slug}.md`)
  }
  
  const fileContents = await fs.readFile(filePath, "utf8")
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
    return b.slug.localeCompare(a.slug)
  })
}
