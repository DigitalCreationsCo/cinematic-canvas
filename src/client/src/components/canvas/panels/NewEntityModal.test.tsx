import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NewEntityModal } from './NewEntityModal';

vi.mock('#/components/ui/dialog.js', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#/components/ui/button.js', () => ({
  Button: ({ children, onClick, disabled, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock('#/components/ui/input.js', () => ({
  Input: ({ value, onChange, placeholder }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('#/components/ui/textarea.js', () => ({
  Textarea: ({ value, onChange, placeholder }: any) => (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn(),
  apiFetchMultipart: vi.fn(),
}));

vi.mock('../../../lib/routes.js', () => ({
  api: {
    entities: {
      generateFields: vi.fn(() => '/api/entities/generate'),
      list: vi.fn(() => '/api/entities'),
    },
    assets: {
      uploadImage: vi.fn(() => '/api/assets/upload-image'),
      uploadAudio: vi.fn(() => '/api/assets/upload-audio'),
      list: vi.fn(() => '/api/assets'),
    },
  },
}));

vi.mock('../../../store/useProjectStore.js', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      addCharacter: vi.fn(),
      addLocation: vi.fn(),
      addScene: vi.fn(),
    })),
  },
}));

vi.mock('../../../store/useNodeStore.js', () => ({
  useNodeStore: {
    getState: vi.fn(() => ({
      addNode: vi.fn(),
    })),
  },
}));

vi.mock('../../../domain/canvas/NodeFactory.js', () => ({
  NodeFactory: {
    createNode: vi.fn((params) => ({
      id: params.entityId,
      type: params.type,
      position: params.posCanvas,
      data: {},
    })),
  },
}));

import { apiFetch, apiFetchMultipart } from '../../../lib/api.js';

describe('NewEntityModal', () => {
  const mockOnClose = vi.fn();
  const mockProjectId = 'project-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <NewEntityModal
          isOpen={false}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when isOpen is true for character', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('New character')).toBeInTheDocument();
    });

    it('renders dialog when isOpen is true for location', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="location"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('New location')).toBeInTheDocument();
    });

    it('renders dialog when isOpen is true for scene', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="scene"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('New scene')).toBeInTheDocument();
    });

    it('renders name and description inputs', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    });

    it('renders Auto-fill with AI button', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Auto-fill with AI')).toBeInTheDocument();
    });

    it('renders Cancel and Create buttons', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });

    it('Create button is disabled when name is empty', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      const createButton = screen.getByText('Create');
      expect(createButton).toBeDisabled();
    });

    it('Create button is enabled when name is filled', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      const nameInput = screen.getByPlaceholderText('Name');
      fireEvent.change(nameInput, { target: { value: 'Test Character' } });
      const createButton = screen.getByText('Create');
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('handleGenerate', () => {
    it('calls apiFetch when Auto-fill button is clicked', async () => {
      (apiFetch as any).mockResolvedValue({ name: 'Generated Name', description: 'Generated Description' });

      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );

      const generateButton = screen.getByText('Auto-fill with AI');
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalled();
      });
    });

    it('sets isGenerating to true during generation', async () => {
      let resolveFetch: any;
      (apiFetch as any).mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );

      const generateButton = screen.getByText('Auto-fill with AI');
      fireEvent.click(generateButton);

      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });
  });

  describe('handleSubmit', () => {
    it('calls onClose after successful submit', async () => {
      (apiFetch as any).mockResolvedValue({ entities: [{ id: 'new-entity-123' }] });
      (apiFetchMultipart as any).mockResolvedValue({ imagePublicUri: 'https://example.com/image.png', imageGcsUri: 'gs://bucket/image.png' });

      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );

      const nameInput = screen.getByPlaceholderText('Name');
      fireEvent.change(nameInput, { target: { value: 'Test Character' } });

      const createButton = screen.getByText('Create');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('dialog close', () => {
    it('calls onClose when Cancel is clicked', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
