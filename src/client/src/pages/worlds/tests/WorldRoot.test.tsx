/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorldRoot } from '../WorldRoot.js';

// Mock child components
vi.mock('../StartModal.js', () => ({
  StartModal: ({ isOpen, onSelectAction }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="start-modal">
        <button data-testid="btn-new-world" onClick={() => onSelectAction('new-world')}>New World</button>
        <button data-testid="btn-load-world" onClick={() => onSelectAction('load-world')}>Load World</button>
        <button data-testid="btn-project" onClick={() => onSelectAction('project')}>Project</button>
      </div>
    );
  }
}));

vi.mock('../SelectWorldModal.js', () => ({
  SelectWorldModal: ({ isOpen, onBack, onSelectWorld, onShowProjects }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="select-world-modal">
        <button data-testid="btn-sw-back" onClick={onBack}>Back</button>
        <button data-testid="btn-sw-select" onClick={() => onSelectWorld('w1')}>Select W1</button>
        <button data-testid="btn-sw-projects" onClick={() => onShowProjects('w1')}>Projects W1</button>
      </div>
    );
  }
}));

vi.mock('../WorldBuilder.js', () => ({
  WorldBuilder: ({ onBack }: any) => {
    return (
      <div data-testid="world-builder">
        <button data-testid="btn-wb-back" onClick={onBack}>Back</button>
      </div>
    );
  }
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()]
}));

describe('WorldRoot', () => {
  const mockOnOpenProjectModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders StartModal initially', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    expect(screen.getByTestId('start-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('select-world-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('world-builder')).not.toBeInTheDocument();
  });

  it('transitions to WorldBuilder when New World is selected', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Click New World
    fireEvent.click(screen.getByTestId('btn-new-world'));
    
    expect(screen.queryByTestId('start-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('world-builder')).toBeInTheDocument();
  });

  it('transitions to SelectWorldModal when Load World is selected', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Click Load World
    fireEvent.click(screen.getByTestId('btn-load-world'));
    
    expect(screen.queryByTestId('start-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('select-world-modal')).toBeInTheDocument();
  });

  it('calls onOpenProjectModal when Project is selected', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Click Project
    fireEvent.click(screen.getByTestId('btn-project'));
    
    expect(mockOnOpenProjectModal).toHaveBeenCalledTimes(1);
    // Should still show StartModal behind it
    expect(screen.getByTestId('start-modal')).toBeInTheDocument();
  });

  it('handles back navigation from WorldBuilder', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Go to WorldBuilder
    fireEvent.click(screen.getByTestId('btn-new-world'));
    expect(screen.getByTestId('world-builder')).toBeInTheDocument();
    
    // Click Back
    fireEvent.click(screen.getByTestId('btn-wb-back'));
    
    expect(screen.queryByTestId('world-builder')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-modal')).toBeInTheDocument();
  });

  it('handles back navigation from SelectWorldModal', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Go to SelectWorldModal
    fireEvent.click(screen.getByTestId('btn-load-world'));
    expect(screen.getByTestId('select-world-modal')).toBeInTheDocument();
    
    // Click Back
    fireEvent.click(screen.getByTestId('btn-sw-back'));
    
    expect(screen.queryByTestId('select-world-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-modal')).toBeInTheDocument();
  });

  it('handles select world action from SelectWorldModal', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Go to SelectWorldModal
    fireEvent.click(screen.getByTestId('btn-load-world'));
    
    // Click Select
    fireEvent.click(screen.getByTestId('btn-sw-select'));
    
    // Should transition to builder
    expect(screen.queryByTestId('select-world-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('world-builder')).toBeInTheDocument();
  });

  it('handles show projects action from SelectWorldModal', () => {
    render(<WorldRoot onOpenProjectModal={mockOnOpenProjectModal} />);
    
    // Go to SelectWorldModal
    fireEvent.click(screen.getByTestId('btn-load-world'));
    
    // Click Projects
    fireEvent.click(screen.getByTestId('btn-sw-projects'));
    
    expect(mockOnOpenProjectModal).toHaveBeenCalledTimes(1);
    // Should still show select world modal behind it
    expect(screen.getByTestId('select-world-modal')).toBeInTheDocument();
  });
});