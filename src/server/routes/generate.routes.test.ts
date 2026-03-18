// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import generateRouter from './generate.routes.js';
import { api } from './api-routes.js';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ name: 'Generated Name' }) })
}));

vi.mock('../../shared/lm/text-model-controller.js', () => ({
  TextModelController: class {
    textModel = 'test-model';
    generateContent = mockGenerateContent;
  }
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', email: 'test@example.com' };
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api', generateRouter);

describe('generate.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/entities/generate-fields', () => {
    it('should generate fields successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Generated Entity' }) });
      const res = await request(app)
        .post('/api' + api.entities.generateFields())
        .send({ entityType: 'character', currentFields: {}, promptContext: 'test context' });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'Generated Entity' });
    });

    it('should generate fields successfully without promptContext', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Generated Entity' }) });
      const res = await request(app)
        .post('/api' + api.entities.generateFields())
        .send({ entityType: 'character', currentFields: {} });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'Generated Entity' });
    });

    it('should handle missing text in response', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: null });
      const res = await request(app)
        .post('/api' + api.entities.generateFields())
        .send({ entityType: 'character', currentFields: {}, promptContext: 'test context' });
      
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No text generated');
    });

    it('should handle generation errors', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Generation failed'));
      const res = await request(app)
        .post('/api' + api.entities.generateFields())
        .send({ entityType: 'character', currentFields: {}, promptContext: 'test context' });
      
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Generation failed');
    });

    it('should handle generation errors without message', async () => {
      mockGenerateContent.mockRejectedValueOnce({});
      const res = await request(app)
        .post('/api' + api.entities.generateFields())
        .send({ entityType: 'character', currentFields: {}, promptContext: 'test context' });
      
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to generate fields.');
    });
  });
});
