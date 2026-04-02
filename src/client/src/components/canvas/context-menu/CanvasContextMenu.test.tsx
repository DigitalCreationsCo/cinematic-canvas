import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { CanvasContextMenu } from './CanvasContextMenu';
import { EventStopper } from '../../ui/event-stopper';

vi.mock('lucide-react', () => ({
  User: () => <div data-testid="lucide-user" />,
  MapPin: () => <div data-testid="lucide-mappin" />,
  Clapperboard: () => <div data-testid="lucide-clapperboard" />,
  Music: () => <div data-testid="lucide-music" />,
  FileImage: () => <div data-testid="lucide-fileimage" />,
  Layers: () => <div data-testid="lucide-layers" />,
}));

const mockOnClose = vi.fn();
const mockProjectId = 'project-123';

vi.mock('#client/store/useNodeStore.js', () => ({
  useNodeStore: vi.fn(() => ({
    nodes: [],
    edges: [],
    addNode: vi.fn(),
  })),
}));

vi.mock('#client/store/useProjectStore.js', () => ({
  useProjectStore: vi.fn(() => ({
    selectedProjectId: mockProjectId,
    addCharacter: vi.fn(),
    addLocation: vi.fn(),
    addScene: vi.fn(),
  })),
}));

vi.mock('#client/store/useCanvasUIStore.js', () => ({
  useCanvasUIStore: vi.fn(() => ({
    autoLayout: false,
  })),
}));

vi.mock('#client/store/useUIMenuStore.js', () => ({
  useUIMenuStore: vi.fn(() => ({
    isDropdownOpen: false,
    setDropdownOpen: vi.fn(),
  })),
}));

vi.mock('#client/domain/canvas/NodeFactory.js', () => ({
  NodeFactory: {
    createNode: vi.fn((params) => ({
      id: params.entityId,
      type: params.type,
      position: params.posCanvas,
      data: {},
    })),
  },
}));

vi.mock('#client/domain/canvas/CoordinateSystem.js', () => ({
  calculateAutoLayoutPosition: vi.fn(() => ({ x: 100, y: 100 })),
}));

vi.mock('../panels/NewEntityModal', () => ({
  NewEntityModal: ({ isOpen, onClose, entityType }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="new-entity-modal">
        <div data-testid="modal-title">New {entityType}</div>
        <input
          data-testid="modal-name-input"
          placeholder="Name"
          onChange={() => {}}
        />
        <textarea
          data-testid="modal-description-input"
          placeholder="Description"
          onChange={() => {}}
        />
        <button data-testid="modal-generate-btn" onClick={() => {}}>
          Auto-fill with AI
        </button>
        <button data-testid="modal-cancel-btn" onClick={onClose}>
          Cancel
        </button>
        <button data-testid="modal-create-btn" onClick={() => {}}>
          Create
        </button>
      </div>
    );
  },
}));

describe('EventStopper', () => {
  it('stops propagation of mouse events', () => {
    const handleClickOutside = vi.fn();
    document.addEventListener('mousedown', handleClickOutside);

    const { getByTestId } = render(
      <EventStopper>
        <div data-testid="stopped-content">
          <button data-testid="inner-button">Click me</button>
        </div>
      </EventStopper>
    );

    const button = getByTestId('inner-button');
    fireEvent.mouseDown(button);

    expect(handleClickOutside).not.toHaveBeenCalled();

    document.removeEventListener('mousedown', handleClickOutside);
  });

  it('stops propagation of click events', () => {
    const handleClickOutside = vi.fn();
    document.addEventListener('click', handleClickOutside);

    const { getByTestId } = render(
      <EventStopper>
        <div data-testid="stopped-content">
          <button data-testid="inner-button">Click me</button>
        </div>
      </EventStopper>
    );

    const button = getByTestId('inner-button');
    fireEvent.click(button);

    expect(handleClickOutside).not.toHaveBeenCalled();

    document.removeEventListener('click', handleClickOutside);
  });

  it('allows events through when disabled', () => {
    const handleClickOutside = vi.fn();
    document.addEventListener('click', handleClickOutside);

    const { getByTestId } = render(
      <EventStopper stopMouseEvents={false}>
        <div data-testid="stopped-content">
          <button data-testid="inner-button">Click me</button>
        </div>
      </EventStopper>
    );

    const button = getByTestId('inner-button');
    fireEvent.click(button);

    expect(handleClickOutside).toHaveBeenCalledTimes(1);

    document.removeEventListener('click', handleClickOutside);
  });
});

describe('CanvasContextMenu', () => {
  beforeEach(() => {
    mockOnClose.mockReset();
    mockOnClose.mockImplementation(() => {});
  });

  const createProps = (overrides = {}) => ({
    contextType: 'project' as const,
    projectId: mockProjectId,
    position: { x: 100, y: 100 },
    canvasPosition: { x: 0, y: 0 },
    open: true,
    onClose: mockOnClose,
    ...overrides,
  });

  describe('click-outside detection (capture phase)', () => {
    it('uses capture phase to detect clicks', () => {
      const handleCaptureMouseDown = vi.fn();
      document.addEventListener('mousedown', handleCaptureMouseDown, true);
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      fireEvent.mouseDown(document.body);
      expect(handleCaptureMouseDown).toHaveBeenCalled();
      document.removeEventListener('mousedown', handleCaptureMouseDown, true);
      unmount();
    });
  });

  describe('modal interaction', () => {
    it('opens NewEntityModal when clicking on Character option', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      unmount();
    });

    it('opens NewEntityModal when clicking on Location option', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const locationButton = screen.getByText('Location');
      fireEvent.click(locationButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      unmount();
    });

    it('opens NewEntityModal when clicking on Scene option', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const sceneButton = screen.getByText('Scene');
      fireEvent.click(sceneButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      unmount();
    });

    it('modal is rendered with correct entity type', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const locationButton = screen.getByText('Location');
      fireEvent.click(locationButton);
      await waitFor(() => {
        expect(screen.getByTestId('modal-title')).toHaveTextContent('New location');
      });
      unmount();
    });
  });

  describe('modal click interaction with capture phase', () => {
    it('modal stays open when clicking inside it', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.mouseDown(nameInput);
      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      unmount();
    });

    it('allows typing in modal form fields', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.click(nameInput);
      fireEvent.change(nameInput, { target: { value: 'Test Character' } });
      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      expect(nameInput).toHaveValue('Test Character');
      unmount();
    });

    it('allows clicking modal buttons', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('modal-generate-btn'));
      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('modal-create-btn'));
      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      unmount();
    });

    it('closes when clicking Cancel button in modal', async () => {
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      const cancelBtn = screen.getByTestId('modal-cancel-btn');
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByTestId('new-entity-modal')).not.toBeInTheDocument();
      });
      unmount();
    });
  });

  describe('event propagation with EventStopper', () => {
    it('EventStopper prevents document mousedown from reaching bubble listeners', async () => {
      const handleDocumentMouseDown = vi.fn();
      document.addEventListener('mousedown', handleDocumentMouseDown);
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.mouseDown(nameInput);
      expect(handleDocumentMouseDown).not.toHaveBeenCalled();
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      unmount();
    });

    it('capture phase listener fires even with EventStopper wrapping modal', async () => {
      const handleCaptureMouseDown = vi.fn();
      document.addEventListener('mousedown', handleCaptureMouseDown, true);
      const { unmount } = render(<CanvasContextMenu {...createProps()} />);
      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);
      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.mouseDown(nameInput);
      expect(handleCaptureMouseDown).toHaveBeenCalled();
      document.removeEventListener('mousedown', handleCaptureMouseDown, true);
      unmount();
    });
  });
});
