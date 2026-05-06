import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Basic test', () => {
  it('should work with jest-dom matchers', () => {
    render(<div data-testid="test">Hello</div>);
    const el = screen.getByTestId('test');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('Hello');
  });
});
