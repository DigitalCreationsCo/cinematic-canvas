import { Paths } from '#/lib/pageroutes'

export const Documents: Paths[] = [
  {
    title: 'Introduction',
    href: '/intro',
  },
  {
    title: 'Getting Started',
    href: '/getting-started',
    noLink: true,
    items: [
      { title: 'Installation', href: '/installation' },
      { title: 'Configuration', href: '/configuration' },
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Architecture',
    href: '/architecture',
    noLink: true,
    items: [
      { title: 'Overview', href: '/overview' },
      { title: 'Workflows', href: '/workflows' },
      { title: 'State Management', href: '/state-management' },
      { title: 'Data Models', href: '/data-models' },
      { title: 'Prompt Engineering', href: '/prompt-engineering' },
    ],
  },
  {
    title: 'Features',
    href: '/features',
    noLink: true,
    items: [
      { title: 'LTX Video', href: '/ltx-video' },
      { title: 'Audio', href: '/audio' },
      { title: 'Asset Management', href: '/asset-management' },
      { title: 'Reliability', href: '/reliability' },
      { title: 'Continuity', href: '/continuity' },
    ],
  },
  {
    title: 'Operations',
    href: '/operations',
    noLink: true,
    items: [
      { title: 'Deployment', href: '/deployment' },
      { title: 'LTX Deployment', href: '/ltx-deployment' },
      { title: 'Cost Analysis', href: '/cost-analysis' },
      { title: 'Security', href: '/security' },
    ],
  },
]
