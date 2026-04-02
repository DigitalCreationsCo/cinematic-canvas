import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NewEntityModal } from './NewEntityModal';

vi.mock('#client/components/ui/dialog.js', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, onDragEnter, onDragLeave, onDragOver, onDrop, className }: any) => (
    <div className={className} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#client/components/ui/button.js', () => ({
  Button: ({ children, onClick, disabled, variant, size, className }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('#client/components/ui/input.js', () => ({
  Input: ({ value, onChange, placeholder, type, accept, className }: any) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      accept={accept}
      className={className}
    />
  ),
}));

vi.mock('#client/components/ui/textarea.js', () => ({
  Textarea: ({ value, onChange, placeholder }: any) => (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('lucide-react', () => ({
  Upload: ({ className }: any) => <div data-testid="upload-icon" className={className} />,
  X: ({ className }: any) => <div data-testid="x-icon" className={className} />,
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

vi.mock('./EntityFormFields.js', () => ({
  EntityFormFields: ({ entityType, fields, onChange }: any) => (
    <div data-testid="entity-form-fields">
      <input
        placeholder="Name"
        value={fields.name || ''}
        onChange={(e: any) => onChange({ ...fields, name: e.target.value })}
        data-testid="form-name-input"
      />
      <textarea
        placeholder="Description"
        value={fields.description || ''}
        onChange={(e: any) => onChange({ ...fields, description: e.target.value })}
        data-testid="form-description-input"
      />
    </div>
  ),
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

    it('renders entity form fields', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByTestId('entity-form-fields')).toBeInTheDocument();
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
      const nameInput = screen.getByTestId('form-name-input');
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

  describe('drag and drop', () => {
    it('renders upload area for character', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Click to upload reference image')).toBeInTheDocument();
    });

    it('renders upload area for location', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="location"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Click to upload reference image')).toBeInTheDocument();
    });

    it('renders start/end frame upload for scene', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="scene"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Start Frame')).toBeInTheDocument();
      expect(screen.getByText('End Frame')).toBeInTheDocument();
    });

    it('does not render upload area for scene (uses reference image only)', () => {
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="scene"
          initialImageFile={null}
          projectId={mockProjectId}
        />
      );
      expect(screen.queryByText('Click to upload reference image')).toBeInTheDocument();
    });
  });

  describe('audio file handling', () => {
    it('shows audio file name when audio file is passed', () => {
      const audioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
      render(
        <NewEntityModal
          isOpen={true}
          onClose={mockOnClose}
          entityType="character"
          initialImageFile={audioFile}
          projectId={mockProjectId}
        />
      );
      expect(screen.getByText('Audio file selected:')).toBeInTheDocument();
      expect(screen.getByText('test.mp3')).toBeInTheDocument();
    });
  });
});
