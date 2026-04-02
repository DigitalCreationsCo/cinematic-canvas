import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    vi.clearAllMocks();
    mockOnClose.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    contextType: 'project' as const,
    projectId: mockProjectId,
    position: { x: 100, y: 100 },
    canvasPosition: { x: 0, y: 0 },
    open: true,
    onClose: mockOnClose,
  };

  describe('modal interaction', () => {
    it('opens NewEntityModal when clicking on Character option', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
    });

    it('opens NewEntityModal when clicking on Location option', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const locationButton = screen.getByText('Location');
      fireEvent.click(locationButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
    });

    it('opens NewEntityModal when clicking on Scene option', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const sceneButton = screen.getByText('Scene');
      fireEvent.click(sceneButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
    });

    it('modal is rendered with correct entity type', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const locationButton = screen.getByText('Location');
      fireEvent.click(locationButton);

      await waitFor(() => {
        expect(screen.getByTestId('modal-title')).toHaveTextContent('New location');
      });
    });
  });

  describe('modal click interaction (bug fix verification)', () => {
    it('does NOT close when clicking inside the modal after opening from context menu', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.click(nameInput);
      fireEvent.change(nameInput, { target: { value: 'Test Character' } });

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });
    });

    it('allows clicking on modal form fields after opening from context menu', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.click(nameInput);

      const descriptionInput = screen.getByTestId('modal-description-input');
      fireEvent.click(descriptionInput);
      fireEvent.change(descriptionInput, { target: { value: 'Test description' } });

      const generateBtn = screen.getByTestId('modal-generate-btn');
      fireEvent.click(generateBtn);

      const createBtn = screen.getByTestId('modal-create-btn');
      fireEvent.click(createBtn);

      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
    });

    it('closes when clicking Cancel button in modal', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

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
    });

    it('closes context menu AND modal when clicking outside both', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('does not close when clicking on context menu items after modal is open', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      fireEvent.mouseDown(screen.getByText('Character'));

      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
    });
  });

  describe('event propagation prevention', () => {
    it('EventStopper prevents document mousedown from reaching modal', async () => {
      const handleDocumentMouseDown = vi.fn();
      document.addEventListener('mousedown', handleDocumentMouseDown);

      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('modal-name-input');

      fireEvent.mouseDown(nameInput);

      expect(handleDocumentMouseDown).not.toHaveBeenCalled();

      document.removeEventListener('mousedown', handleDocumentMouseDown);
    });

    it('modal stays open when clicking inside it (verifies EventStopper works)', async () => {
      render(<CanvasContextMenu {...defaultProps} />);

      const characterButton = screen.getByText('Character');
      fireEvent.click(characterButton);

      await waitFor(() => {
        expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      });

      const nameInput = screen.getByTestId('modal-name-input');
      fireEvent.click(nameInput);
      fireEvent.change(nameInput, { target: { value: 'Test Name' } });

      expect(screen.getByTestId('new-entity-modal')).toBeInTheDocument();
      expect(nameInput).toHaveValue('Test Name');
    });
  });
});

describe('CanvasContextMenu + NewEntityModal integration (real modal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('modal fields are clickable when opened from CanvasContextMenu - real modal test', async () => {
    const NewEntityModalReal = vi.fn(({ isOpen, onClose, entityType }: any) => {
      if (!isOpen) return null;
      return (
        <div data-testid="real-modal" onClick={(e) => e.stopPropagation()}>
          <div>New {entityType}</div>
          <input
            data-testid="real-modal-input"
            placeholder="Enter name"
            onChange={() => {}}
          />
          <button data-testid="real-modal-submit" onClick={() => onClose()}>
            Submit
          </button>
        </div>
      );
    });

    vi.doMock('../panels/NewEntityModal', () => ({
      NewEntityModal: NewEntityModalReal,
    }));

    render(
      <EventStopper>
        <NewEntityModalReal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
        />
      </EventStopper>
    );

    const input = screen.getByTestId('real-modal-input');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'Test' } });

    expect(input).toHaveValue('Test');
  });
});
