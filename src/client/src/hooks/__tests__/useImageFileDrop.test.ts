import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useImageFileDrop } from '#client/hooks/useImageFileDrop.js';

describe('useImageFileDrop', () => {
  describe('exports', () => {
    it('should export handleImageFile function', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.handleImageFile).toBeDefined();
      expect(typeof result.current.handleImageFile).toBe('function');
    });

    it('should export handleFileDrop function', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.handleFileDrop).toBeDefined();
      expect(typeof result.current.handleFileDrop).toBe('function');
    });

    it('should export isSupportedExtension function', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension).toBeDefined();
      expect(typeof result.current.isSupportedExtension).toBe('function');
    });

    it('should export SUPPORTED_EXTENSIONS array', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toBeDefined();
      expect(Array.isArray(result.current.SUPPORTED_EXTENSIONS)).toBe(true);
    });
  });

  describe('SUPPORTED_EXTENSIONS', () => {
    it('should contain png', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toContain('png');
    });

    it('should contain jpg', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toContain('jpg');
    });

    it('should contain jpeg', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toContain('jpeg');
    });

    it('should contain webp', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toContain('webp');
    });

    it('should have exactly 4 extensions', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.SUPPORTED_EXTENSIONS).toHaveLength(4);
    });
  });

  describe('isSupportedExtension', () => {
    it('should return true for png files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.png')).toBe(true);
    });

    it('should return true for jpg files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.jpg')).toBe(true);
    });

    it('should return true for jpeg files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.jpeg')).toBe(true);
    });

    it('should return true for webp files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.webp')).toBe(true);
    });

    it('should return false for txt files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('document.txt')).toBe(false);
    });

    it('should return false for gif files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.gif')).toBe(false);
    });

    it('should return false for pdf files', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('document.pdf')).toBe(false);
    });

    it('should be case insensitive for extension', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.isSupportedExtension('image.PNG')).toBe(true);
      expect(result.current.isSupportedExtension('image.JPG')).toBe(true);
    });
  });

  describe('handleImageFile signature', () => {
    it('should accept 4 parameters including entityType', () => {
      const { result } = renderHook(() => useImageFileDrop());
      const fn = result.current.handleImageFile;
      expect(fn.length).toBe(4);
    });

    it('should return a Promise', async () => {
      const { result } = renderHook(() => useImageFileDrop());
      const mockFile = new File([''], 'test.png', { type: 'image/png' });
      const ret = result.current.handleImageFile(mockFile, { x: 0, y: 0 }, 'pid', 'character');
      expect(ret).toBeInstanceOf(Promise);
      const resolved = await ret.catch(() => ({ nodeId: '' }));
      expect(resolved).toHaveProperty('nodeId');
    });
  });

  describe('handleFileDrop signature', () => {
    it('should accept 2 parameters', () => {
      const { result } = renderHook(() => useImageFileDrop());
      expect(result.current.handleFileDrop.length).toBe(2);
    });
  });
});
