// src/server/routes/mention.routes.ts
// API routes for Entity Mention System (Tag Registry + KBHydration)

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/index.js';
import { WorldRepository } from '../../shared/services/world-repository.js';
import { TagRegistryService, tagRegistryService } from '../../shared/services/tag-registry.js';
import { KBHydrator } from '../../shared/services/sac/KBHydrator.js';
import {
  ResolveMentionsRequestSchema,
  RegisterHandleInputSchema,
  SuggestMentionsRequestSchema,
} from '../../shared/types/mention.types.js';

const router = Router();

const worldRepo = new WorldRepository();
const kbHydrator = new KBHydrator(worldRepo);

router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const validationResult = ResolveMentionsRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.flatten(),
      });
      return;
    }

    const { htmlInput, projectId } = validationResult.data;

    const userId = req.headers['x-user-id'] as string || 'anonymous';

    const result = await kbHydrator.execute({
      userId,
      projectId,
      htmlInput,
    });

    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error({ error: errorMessage }, 'Mention resolve endpoint failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId/suggest', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const validationResult = SuggestMentionsRequestSchema.safeParse({
      ...req.query,
      projectId: req.params.projectId,
    });

    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error,
      });
      return;
    }

    const { query, projectId, limit } = validationResult.data;
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    const allSuggestions = await tagRegistryService.getAccessibleHandles(projectId, userId, db);

    const normalizedQuery = query?.toLowerCase() ?? '';
    const filtered = allSuggestions
      .filter(s => s.handle.toLowerCase().includes(normalizedQuery))
      .slice(0, limit);

    res.json({
      suggestions: filtered,
      totalAvailable: allSuggestions.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error({ error: errorMessage }, 'Mention suggest endpoint failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const validationResult = RegisterHandleInputSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.flatten(),
      });
      return;
    }

    const entry = await tagRegistryService.registerHandle(validationResult.data, db);
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already registered')) {
        res.status(409).json({ error: error.message });
        return;
      }
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error({ error: errorMessage }, 'Mention register endpoint failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:handle', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const { handle } = req.params;
    if (!handle) {
      res.status(400).json({ error: 'Handle is required' });
      return;
    }

    const deleted = await tagRegistryService.unregisterHandle(handle, db);

    // if (!deleted) {
    //   res.status(404).json({ error: 'Handle not found' });
    //   return;
    // }

    res.status(204).send();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error({ error: errorMessage }, 'Mention unregister endpoint failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    if (!handle) {
      res.status(400).json({ error: 'Handle is required' });
      return;
    }

    const entry = await tagRegistryService.getHandle(handle, db);

    if (!entry) {
      res.status(404).json({ error: 'Handle not found' });
      return;
    }

    res.json(entry);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error({ error: errorMessage }, 'Mention get endpoint failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
