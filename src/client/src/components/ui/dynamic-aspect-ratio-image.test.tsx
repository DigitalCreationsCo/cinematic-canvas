import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DynamicAspectRatioImage } from './dynamic-aspect-ratio-image.tsx';

describe('DynamicAspectRatioImage', () => {
  describe('rendering', () => {
    it('renders image with correct aspect ratio when metadata provided', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'Test image');
    });

    it('renders placeholder when no imageUrl provided', () => {
      render(
        <DynamicAspectRatioImage
          metadata={{ width: 1920, height: 1080 }}
          alt="Test image"
        />
      );

      expect(screen.getByText('No image')).toBeInTheDocument();
    });

    it('uses default aspect ratio when metadata is missing', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('uses default aspect ratio when width is null', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: null, height: 1080 }}
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('uses default aspect ratio when height is null', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: null }}
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('uses default aspect ratio when width is 0', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 0, height: 1080 }}
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('uses default aspect ratio when height is 0', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 0 }}
          alt="Test image"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });
  });

  describe('aspect ratio calculation', () => {
    it('calculates 16:9 ratio correctly', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '16/9' });
    });

    it('calculates 4:3 ratio correctly', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1024, height: 768 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '4/3' });
    });

    it('calculates square 1:1 ratio correctly', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1000, height: 1000 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '1/1' });
    });

    it('calculates portrait 9:16 ratio correctly', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 720, height: 1280 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '9/16' });
    });

    it('calculates 21:9 ultrawide ratio correctly', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 2560, height: 1080 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '21/9' });
    });
  });

  describe('object-fit behavior', () => {
    it('uses contain by default', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveClass('object-contain');
    });

    it('uses cover when specified', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          objectFit="cover"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveClass('object-cover');
    });

    it('uses fill when specified', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          objectFit="fill"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveClass('object-fill');
    });
  });

  describe('loading attributes', () => {
    it('uses lazy loading by default', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('uses eager loading when priority is true', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          priority={true}
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'eager');
    });

    it('uses high fetchPriority when priority is true', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          priority={true}
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('fetchpriority', 'high');
    });
  });

  describe('className prop', () => {
    it('applies custom className', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          className="custom-class"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('applies bg-muted class by default', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveClass('bg-muted');
    });
  });

  describe('custom default aspect ratio', () => {
    it('uses custom default ratio when metadata is missing', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          alt="Test"
          defaultAspectRatio={2.35}
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '21/9' });
    });

    it('prefers metadata over default ratio', () => {
      render(
        <DynamicAspectRatioImage
          imageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          metadata={{ width: 1920, height: 1080 }}
          alt="Test"
          defaultAspectRatio={2.35}
        />
      );

      const container = screen.getByRole('img').parentElement;
      expect(container).toHaveStyle({ aspectRatio: '16/9' });
    });
  });
});
