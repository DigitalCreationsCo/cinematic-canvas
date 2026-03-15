import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';

vi.mock('lucide-react', () => ({
  Play: () => null,
  Square: () => null,
  Undo: () => null,
  Redo: () => null,
  LayoutGrid: () => null,
}));

vi.mock('../../../store/usePipelineStore.js', () => ({
  usePipelineStore: vi.fn(() => ({
    status: 'idle',
  })),
}));

vi.mock('../../../store/useCanvasUIStore.js', () => ({
  useCanvasUIStore: vi.fn(() => ({
    snapToGrid: false,
    setSnapToGrid: vi.fn(),
  })),
}));

vi.mock('#/store/useProjectStore.js', () => {
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

vi.mock('#/store/useWorldStore.js', () => ({
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

vi.mock('#/store/useAssetStore.js', () => ({
  useAssetStore: vi.fn(() => ({
    assets: new Map(),
  })),
}));

vi.mock('../../ui/button.js', () => ({
  Button: ({ children, className, onClick, size, variant }: any) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
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
  const handleResume = vi.fn();
  const handleStop = vi.fn();

  it('renders without crashing', () => {
    render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/start pipeline/i)).toBeInTheDocument();
  });

  it('renders project title', () => {
    render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/Test Project/i)).toBeInTheDocument();
  });

  it('renders toolbar content', () => {
    render(<CanvasToolbar handleStop={handleStop} handleResume={handleResume} />);
    expect(screen.getByText(/Test World/i)).toBeInTheDocument();
  });
});
