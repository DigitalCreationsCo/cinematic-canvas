/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorldBuilder } from '../WorldBuilder.js';

vi.mock('#/components/ui/button.js', () => ({
  Button: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow">ArrowLeft</span>,
}));

describe('WorldBuilder', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<WorldBuilder onBack={mockOnBack} />);
    
    expect(screen.getByText('World Builder')).toBeInTheDocument();
    expect(screen.getByText('Create the foundational setting, characters, and rules for your cinematic canvas.')).toBeInTheDocument();
    expect(screen.getByText('[ World Builder Canvas Coming Soon ]')).toBeInTheDocument();
  });

  it('renders the back button and calls onBack when clicked', () => {
    render(<WorldBuilder onBack={mockOnBack} />);
    
    const backButton = screen.getByTestId('button');
    expect(backButton).toHaveTextContent('Back to Start');
    
    fireEvent.click(backButton);
    
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});