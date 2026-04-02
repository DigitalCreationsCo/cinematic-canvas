import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';

vi.mock('lucide-react', () => ({
  Play: () => null,
  Square: () => null,
  Undo: () => null,
  Redo: () => null,
  LayoutGrid: () => null,
  Eye: () => null,
  EyeOff: () => null,
  Plus: () => null,
  User: () => null,
  MapPin: () => null,
  Clapperboard: () => null,
  Music: () => null,
  FileImage: () => null,
  Layers: () => null,
  GitBranch: () => null,
  Loader2: () => null,
  AlertCircle: () => null,
  Check: () => null,
  Loader: () => null,
}));

vi.mock('../../../store/usePipelineStore.js', () => ({
  usePipelineStore: vi.fn(() => ({
    status: 'idle',
  })),
}));

vi.mock('../../../store/useCanvasUIStore.js', () => {
  const mockStore = {
    snapToGrid: false,
    setSnapToGrid: vi.fn(),
    autoLayout: false,
    toggleAutoLayout: vi.fn(),
    lastSaved: null,
    saveError: null,
  };
  return {
    useCanvasUIStore: vi.fn((selector?: (s: typeof mockStore) => unknown) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    }),
  };
});

vi.mock('../../../store/useCanvasInteractionStore.js', () => ({
  useCanvasInteractionStore: vi.fn(() => ({
    edgeVisibilityMode: 'none',
    toggleEdgeVisibility: vi.fn(),
    pendingChanges: new Map(),
  })),
}));

vi.mock('#client/store/useProjectStore.js', () => {
  const mockState = {
    scenes: new Map(),
    metadata: { title: 'Test Project' },
  };
  return {
    useProjectStore: vi.fn((selector) => {
      if (typeof selector === 'function') {
        return selector(mockState);
      }
      return mockState;
    }),
    selectMostRecentSavedAt: vi.fn(() => null),
  };
});

vi.mock('#client/store/useWorldStore.js', () => ({
  useWorldStore: vi.fn((selector) => {
    if (selector === undefined) {
      return {
        worldName: 'Test World',
      };
    }
    if (typeof selector === 'function') {
      return selector({ worldName: 'Test World' });
    }
    return 'Test World';
  }),
}));

vi.mock('#client/store/useAssetStore.js', () => ({
  useAssetStore: vi.fn(() => ({
    assets: new Map(),
  })),
}));

vi.mock('../../ui/button.js', () => ({
  Button: ({ children, className, onClick, size, variant }: any) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
}));

vi.mock('../../ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: any) => asChild ? children : <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../../ui/tooltip.js', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children, asChild }: any) => asChild ? children : <div>{children}</div>,
  TooltipContent: () => null,
}));

vi.mock('../../../hooks/useUndoRedo.js', () => ({
  useUndoRedo: vi.fn(() => ({
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
  })),
}));

vi.mock('#client/components/AgentToolbar.js', () => ({
  AgentToolbar: vi.fn(() => null),
}));

vi.mock('#client/components/canvas/panels/NewEntityModal.js', () => ({
  NewEntityModal: vi.fn(() => null),
}));

vi.mock('../../../store/useNodeStore.js', () => {
  const mockTemporal = {
    getState: () => ({
      pastStates: [],
      futureStates: [],
      undo: vi.fn(),
      redo: vi.fn(),
    }),
  };
  const mockFn = () => mockTemporal;
  (mockFn as any).temporal = mockTemporal;
  return {
    useNodeStore: mockFn,
  };
});

beforeEach(() => {
  const slot = document.createElement('div');
  slot.id = 'canvas-toolbar-slot';
  document.body.appendChild(slot);
});

afterEach(() => {
  const slot = document.getElementById('canvas-toolbar-slot');
  if (slot) {
    slot.remove();
  }
});

describe('CanvasToolbar', () => {
  const handleStart = vi.fn();
  const handleResume = vi.fn();
  const handleStop = vi.fn();

  it('renders without crashing', () => {
    render(<CanvasToolbar handleStart={handleStart} handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
  });

  it('renders project title', () => {
    render(<CanvasToolbar handleStart={handleStart} handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
  });

  it('renders toolbar content', () => {
    render(<CanvasToolbar handleStart={handleStart} handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/Test World/i)).toBeInTheDocument();
  });
});
