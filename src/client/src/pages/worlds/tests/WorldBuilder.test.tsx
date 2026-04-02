/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorldBuilder } from '../WorldBuilder.js';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow">ArrowLeft</span>,
  Globe: () => <span data-testid="icon-globe">Globe</span>,
}));

vi.mock('#client/components/ui/button.js', () => ({
  Button: ({ children, onClick, variant, className }: any) => (
    <button onClick={onClick} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('../../store/useWorldStore.js', () => ({
  useWorldStore: vi.fn(() => ({
    worldId: null,
    worldName: null,
    setWorld: vi.fn(),
  })),
}));

vi.mock('../CreateWorldModal.js', () => ({
  CreateWorldModal: () => null,
}));

describe('WorldBuilder', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<WorldBuilder onBack={mockOnBack} />);

    expect(screen.getByText('World Builder')).toBeInTheDocument();
    expect(screen.getByText('Build lore, bring characters to life, and define the continuity of your world.')).toBeInTheDocument();
    expect(screen.getByText('Add First Asset (Test)')).toBeInTheDocument();
  });

  it('renders the back button and calls onBack when clicked', () => {
    render(<WorldBuilder onBack={mockOnBack} />);

    const buttons = screen.getAllByTestId('button');
    const backButton = buttons[0];
    expect(backButton).toHaveTextContent('Exit Builder');

    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});