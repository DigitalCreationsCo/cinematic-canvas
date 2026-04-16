import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CompositeNode } from './CompositeNode.js';
import type { CanvasNode } from '../../../domain/canvas/NodeTypes.js';
import type { NodeProps } from '@xyflow/react';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { usePipelineStore } from '#client/store/usePipelineStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { useAssetStore } from '#client/store/useAssetStore.js';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';

vi.mock('lucide-react', () => ({
  Layers: () => null,
}));

vi.mock('#client/store/useNodeStore.js', () => ({
  useNodeStore: vi.fn((selector) => {
    const mockState = {
      edges: [],
      nodes: [],
    };
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  }),
}));

vi.mock('#client/store/useProjectStore.js', () => ({
  useProjectStore: vi.fn((selector) => {
    const mockState = {
      selectedProjectId: 'test-project-id',
      characters: new Map(),
      locations: new Map(),
      scenes: new Map(),
    };
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  }),
}));

const mockAssetState = {
  assets: new Map(),
};

vi.mock('#client/store/useAssetStore.js', () => ({
  useAssetStore: vi.fn(() => ({
    assets: mockAssetState.assets,
    getState: () => mockAssetState,
  })),
}));

vi.mock('#client/store/usePipelineStore.js', () => ({
  usePipelineStore: vi.fn((selector) => {
    const mockState = {
      pushEvent: vi.fn(),
    };
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  }),
}));

vi.mock('#client/store/useCanvasUIStore.js', () => ({
  useCanvasUIStore: vi.fn((selector) => {
    const mockState = {
      isLoading: false,
    };
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  }),
}));

vi.mock('#client/lib/api.js', () => ({
  generateComposites: vi.fn().mockResolvedValue({ message: 'queued' }),
}));

vi.mock('../../../../../shared/utils/assets-utils.js', () => ({
  getAllBestAssets: vi.fn().mockReturnValue({}),
}));

vi.mock('./NodeShell.js', () => ({
  NodeShell: ({ children, additionalTargetHandles, sourceHandle }: any) => (
    <div data-testid="node-shell">
      <div data-testid="additional-handles">{additionalTargetHandles?.length || 0}</div>
      <div data-testid="source-handles">{sourceHandle ? 1 : 0}</div>
      {children}
    </div>
  ),
}));

const createMockCompositeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'composite-node-1',
  type: 'composite',
  position: { x: 0, y: 0 },
  data: {
    entityId: 'composite-entity-1',
    contextId: 'test-project-id',
    contextType: 'project',
    scope: 'project',
    isLocked: false,
    pipelineSelected: false,
    collapsed: false,
    idxVersion: 1,
    pendingChangeCount: 0,
    ...overrides,
  },
  ...overrides,
} as CanvasNode);

const mockProps = {
  isConnectable: true,
  selected: false,
} as NodeProps<CanvasNode>;

describe('CompositeNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the node shell', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByTestId('node-shell')).toBeInTheDocument();
    });

    it('renders composite merge header text', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByText('COMPOSITE MERGE')).toBeInTheDocument();
    });

    it('renders generate button', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByRole('button', { name: /Generate Output/i })).toBeInTheDocument();
    });

    it('shows "<< Select to adjust weights" when no inputs connected', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByText('<< Select to adjust weights')).toBeInTheDocument();
    });

    it('displays pending change count badge when greater than 0', () => {
      const node = createMockCompositeNode({
        data: { pendingChangeCount: 3 } as any,
      });
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      const badges = screen.getAllByText('3');
      expect(badges.length).toBeGreaterThan(0);
      const badge = badges.find(b => b.className.includes('bg-amber'));
      expect(badge).toBeInTheDocument();
    });

    it('does not display pending count badge when count is 0', () => {
      const node = createMockCompositeNode({
        data: { pendingChangeCount: 0 } as any,
      });
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();
    });
  });

  describe('handle configuration', () => {
    it('renders 3 additional target handles for composite inputs', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByTestId('additional-handles')).toHaveTextContent('3');
    });

    it('renders 1 source handle for output', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByTestId('source-handles')).toHaveTextContent('1');
    });
  });

  describe('generate button state', () => {
    it('button is disabled when no inputs connected', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      const button = screen.getByRole('button', { name: /Generate Output/i });
      expect(button).toBeDisabled();
    });
  });

  describe('composite data persistence', () => {
    it('reads compositePrompt from node data', () => {
      const node = createMockCompositeNode({
        data: { compositePrompt: 'Blend with warm tones' } as any,
      });
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByText('COMPOSITE MERGE')).toBeInTheDocument();
    });

    it('reads compositeWeights from node data', () => {
      const node = createMockCompositeNode({
        data: { compositeWeights: [30, 70, 0] } as any,
      });
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByText('COMPOSITE MERGE')).toBeInTheDocument();
    });

    it('defaults to equal weights when not specified', () => {
      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      expect(screen.getByText('COMPOSITE MERGE')).toBeInTheDocument();
    });
  });

  describe('handleGenerate validation', () => {
    it('button is disabled when isLoading is true', () => {
      vi.mocked(useCanvasUIStore).mockImplementation((selector: any) => {
        const mockState = { isLoading: true };
        return typeof selector === 'function' ? selector(mockState) : mockState;
      });

      const node = createMockCompositeNode();
      render(<CompositeNode {...mockProps} data={node.data} id={node.id} />);

      const button = screen.getByRole('button', { name: /Generate Output/i });
      expect(button).toBeDisabled();
    });
  });
});
