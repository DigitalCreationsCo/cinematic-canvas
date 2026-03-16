import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MetadataNodeInspector } from './MetadataNodeInspector';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';

vi.mock('lucide-react', () => ({
  BookOpen: () => null,
  Globe: () => null,
  FileText: () => null,
  Tag: () => null,
  Palette: () => null,
  Music: () => null,
  Link2: () => null,
  GitBranch: () => null,
  AlertCircle: () => null,
  CheckCircle2: () => null,
  Clock: () => null,
  User: () => null,
  Crown: () => null,
  Edit3: () => null,
  Eye: () => null,
}));

vi.mock('../../../store/useWorldStore.js', () => ({
  useWorldStore: vi.fn((selector) => {
    const mockWorldState = {
      worldId: 'test-world-id',
      worldName: 'Test World',
      role: 'owner' as const,
      licenseType: 'full-collab',
      sacRepoId: 'sac-repo-123',
      commitHistory: [{ id: '1', message: 'Initial commit' }, { id: '2', message: 'Second commit' }],
      isDirty: false,
    };
    if (typeof selector === 'function') {
      return selector(mockWorldState);
    }
    return mockWorldState;
  }),
}));

vi.mock('#/store/useProjectStore.js', () => {
  const mockProjectState = {
    selectedProjectId: 'test-project-id',
    metadata: {
      title: 'Test Project',
      logline: 'A test project for unit testing',
      totalScenes: 5,
      style: 'cinematic',
      mood: 'dramatic',
      colorPalette: ['#FF0000', '#00FF00', '#0000FF'],
      tags: ['action', 'sci-fi'],
      initialPrompt: 'Generate an action scene',
      enhancedPrompt: 'Generate an action scene with dramatic lighting',
      hasAudio: true,
      audioGcsUri: 'gs://bucket/audio.mp3',
      audioPublicUri: 'https://cdn.example.com/audio.mp3',
    },
    scenes: new Map([['scene1', { id: 'scene1' }]]),
    characters: new Map([['char1', { id: 'char1' }]]),
    locations: new Map([['loc1', { id: 'loc1' }]]),
  };
  return {
    useProjectStore: vi.fn((selector) => {
      if (typeof selector === 'function') {
        return selector(mockProjectState);
      }
      return mockProjectState;
    }),
  };
});

vi.mock('./RbacBanner', () => ({
  RbacBanner: ({ isLocked }: { isLocked: boolean }) => (
    <div data-testid="rbac-banner">RbacBanner</div>
  ),
}));

vi.mock('../../ui/tabs.js', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs">{children}</div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs-list">{children}</div>
  ),
  TabsTrigger: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button data-testid={`tab-trigger-${value}`}>{children}</button>
  ),
  TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

vi.mock('../../ui/card.js', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div data-testid="card-title">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
}));

vi.mock('../../ui/badge.js', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

vi.mock('../../ui/scroll-area.js', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
}));

const createMockNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'metadata-node',
  type: 'metadata',
  position: { x: 0, y: 0 },
  data: {
    entityId: 'metadata-entity',
    contextId: 'test-context',
    contextType: 'project',
    scope: 'project',
    isLocked: false,
    pipelineSelected: true,
    collapsed: false,
    idxVersion: 1,
    ...overrides,
  },
  ...overrides,
} as CanvasNode);

describe('MetadataNodeInspector', () => {
  describe('rendering with linked world', () => {
    it('renders World and Project tabs when world is linked', () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);
      
      expect(screen.getByTestId('tab-trigger-world')).toBeInTheDocument();
      expect(screen.getByTestId('tab-trigger-project')).toBeInTheDocument();
    });

    it('displays world name in header', () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);
      
      expect(screen.getByText(/Test World/i)).toBeInTheDocument();
    });

    it('displays project title in header', () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);
      
      const projectText = screen.getAllByText(/Test Project/i);
      expect(projectText.length).toBeGreaterThan(0);
    });

    it('renders RbacBanner component', () => {
      const node = createMockNode();
      render(<MetadataNodeInspector node={node} />);
      
      expect(screen.getByTestId('rbac-banner')).toBeInTheDocument();
    });
  });

  describe('node data', () => {
    it('renders with isLocked=false', () => {
      const node = createMockNode({ data: { ...createMockNode().data, isLocked: false } });
      const { container } = render(<MetadataNodeInspector node={node} />);
      
      expect(container).toBeInTheDocument();
    });

    it('renders with isLocked=true', () => {
      const node = createMockNode({ data: { ...createMockNode().data, isLocked: true } });
      const { container } = render(<MetadataNodeInspector node={node} />);
      
      expect(container).toBeInTheDocument();
    });

    it('renders with scope=world', () => {
      const node = createMockNode({ data: { ...createMockNode().data, scope: 'world' } });
      const { container } = render(<MetadataNodeInspector node={node} />);
      
      expect(container).toBeInTheDocument();
    });

    it('renders with scope=project', () => {
      const node = createMockNode({ data: { ...createMockNode().data, scope: 'project' } });
      const { container } = render(<MetadataNodeInspector node={node} />);
      
      expect(container).toBeInTheDocument();
    });
  });
});
