import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeCodeTitles from 'rehype-code-titles';
import rehypeKatex from 'rehype-katex';
import rehypePrism from 'rehype-prism-plus';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { components } from '#/lib/components.js';

export interface Author {
  name: string;
  title?: string;
  url?: string;
  image_url?: string;
  socials?: {
    x?: string;
    linkedin?: string;
    github?: string;
    newsletter?: string;
  };
}

// Define the interface for the frontmatter of an update
export interface UpdateFrontmatter {
  title: string;
  description: string;
  date: string;
  author?: string | string[];
  authors?: string | string[]; // Support both singular and plural
  coverImage?: string;
}

export interface Update {
  slug: string;
  frontmatter: UpdateFrontmatter;
  authors: Author[];
  content: any; // React node from MDX
  summary: any; // Truncated React node
  tocs: { level: number; text: string; href: string; }[];
}

const headingsRegex = /^(#{2,4})\s(.+)$/gm;

function innerslug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '');
}

export async function getTable(
  rawMdx: string
): Promise<{ level: number; text: string; href: string; }[]> {
  const extractedHeadings: {
    level: number;
    text: string;
    href: string;
  }[] = [];

  let match;
  while ((match = headingsRegex.exec(rawMdx)) !== null) {
    const level = match[ 1 ].length;
    const text = match[ 2 ].trim();
    extractedHeadings.push({
      level: level,
      text: text,
      href: `#${innerslug(text)}`,
    });
  }

  return extractedHeadings;
}

const updatesDirectory = path.join(process.cwd(), 'contents/updates');
const authorsFile = path.join(updatesDirectory, 'authors.yml');

let cachedAuthors: Record<string, Author> | null = null;

async function getAuthors(): Promise<Record<string, Author>> {
  if (cachedAuthors) return cachedAuthors;

  try {
    if (existsSync(authorsFile)) {
      const content = await fs.readFile(authorsFile, 'utf8');
      cachedAuthors = yaml.load(content) as Record<string, Author>;
      return cachedAuthors || {};
    }
  } catch (error) {
    console.error('Error loading authors:', error);
  }
  return {};
}

async function parseMdx(source: string) {
  return await compileMDX<UpdateFrontmatter>({
    source: source,
    options: {
      parseFrontmatter: false, // Explicitly false as we use gray-matter
      mdxOptions: {
        rehypePlugins: [
          rehypeCodeTitles,
          rehypeKatex,
          rehypePrism,
          rehypeSlug,
          rehypeAutolinkHeadings,
        ],
        remarkPlugins: [ remarkGfm ],
      },
    },
    components: components as any,
  });
}

export async function getAllUpdates(): Promise<Update[]> {
  try {
    const files = await fs.readdir(updatesDirectory);
    const updates: Update[] = [];

    for (const file of files) {
      if (path.extname(file) === '.mdx' || path.extname(file) === '.md') {
        const slug = file.replace(/\.(mdx|md)$/, '');
        const update = await getUpdate(slug);
        if (update) {
          updates.push(update);
        }
      }
    }

    // Sort updates by date descending
    return updates.sort((a, b) => {
      const dateA = new Date(a.frontmatter.date).getTime();
      const dateB = new Date(b.frontmatter.date).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    console.warn('Error reading updates directory:', error);
    return [];
  }
}

export async function getUpdate(slug: string): Promise<Update | null> {
  try {
    // Try .mdx then .md
    let filePath = path.join(updatesDirectory, `${slug}.mdx`);
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      filePath = path.join(updatesDirectory, `${slug}.md`);
      fileContent = await fs.readFile(filePath, 'utf-8');
    }

    const { data: frontmatter, content: rawContent } = matter(fileContent);

    // Support both <!-- truncate --> and {/* truncate */}
    const truncateRegex = /{\/\*\s*truncate\s*\*\/}|<!--\s*truncate\s*-->/;
    const parts = rawContent.split(truncateRegex);
    let summaryRaw = parts[ 0 ];

    if (parts.length === 1 && rawContent.length > 300) {
      const paragraphBreak = rawContent.indexOf('\n\n', 200);
      if (paragraphBreak !== -1 && paragraphBreak < 500) {
        summaryRaw = rawContent.substring(0, paragraphBreak);
      } else {
        summaryRaw = rawContent.substring(0, 300) + '...';
      }
    }

    const parsedMdx = await parseMdx(rawContent);
    const parsedSummary = await parseMdx(summaryRaw);
    const tocs = await getTable(rawContent);

    // Robust inference
    const inferredFrontmatter = frontmatter as UpdateFrontmatter;

    // 1. Infer Date from filename (YYYY-MM-DD)
    if (!inferredFrontmatter.date) {
      const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        inferredFrontmatter.date = dateMatch[ 1 ].replace(/-/g, '/');
      } else {
        inferredFrontmatter.date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
      }
    } else {
      // Ensure the date string is parsed as local time by replacing - with /
      // if it's in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(inferredFrontmatter.date)) {
        inferredFrontmatter.date = inferredFrontmatter.date.replace(/-/g, '/');
      }
    }

    // 2. Infer Title from first Heading if missing
    if (!inferredFrontmatter.title) {
      const titleMatch = rawContent.match(/^#\s+(.+)$/m);
      inferredFrontmatter.title = titleMatch ? titleMatch[ 1 ] : slug;
    }

    // 3. Fallback description
    if (!inferredFrontmatter.description) {
      inferredFrontmatter.description = 'No description provided.';
    }

    // Resolve authors
    const allAuthors = await getAuthors();
    const authorIds = inferredFrontmatter.authors || inferredFrontmatter.author || [];
    const authorIdArray = Array.isArray(authorIds) ? authorIds : [ authorIds ];
    const resolvedAuthors = authorIdArray
      .map(id => allAuthors[ id ])
      .filter(Boolean);

    return {
      slug,
      frontmatter: inferredFrontmatter,
      authors: resolvedAuthors,
      content: parsedMdx.content,
      summary: parsedSummary.content,
      tocs,
    };
  } catch (error) {
    console.error(`Error reading update ${slug}:`, error);
    return null;
  }
}
