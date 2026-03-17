// @vitest-environment node
// src/server/routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes.js';

// Define hoisted mocks
const { mockDb, MockProjectRepository, MockWorldRepository, mockGetProjectsForUser, mockCreateProject, mockGetWorldsForUser, mockCreateWorld } = vi.hoisted(() => {
    const mockGetProjectsForUser = vi.fn().mockResolvedValue([]);
    const mockCreateProject = vi.fn().mockResolvedValue({ id: 'proj-1' });
    const mockGetWorldsForUser = vi.fn().mockResolvedValue([]);
    const mockCreateWorld = vi.fn().mockResolvedValue({ id: 'world-1' });

    const createUsersFindManyMock = () => {
        return vi.fn().mockImplementation((options: any) => {
            if (options?.with?.teams) {
                return Promise.resolve([{ id: 'test-user-id', teams: [{ id: 'team-1', name: 'My Team' }] }]);
            }
            return Promise.resolve([]);
        });
    };

    return {
        mockDb: {
            query: {
                users: { findMany: createUsersFindManyMock() },
                usersToTeams: { findFirst: vi.fn(), findMany: vi.fn() },
                teams: { findFirst: vi.fn() },
            },
            select: vi.fn(() => ({ from: vi.fn(() => ({ innerJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })), where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
            insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue([]) })) })),
            transaction: vi.fn(async (callback) => {
                const txMock = { insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'team-1' }]), onConflictDoNothing: vi.fn().mockResolvedValue([]) })) })) };
                return await callback(txMock);
            }),
        },
        mockGetProjectsForUser, mockCreateProject, mockGetWorldsForUser, mockCreateWorld,
        MockProjectRepository: vi.fn().mockImplementation(function(this: any) { this.getProjectsForUser = mockGetProjectsForUser; this.createProject = mockCreateProject; }),
        MockWorldRepository: vi.fn().mockImplementation(function(this: any) { this.getWorldsForUser = mockGetWorldsForUser; this.createWorld = mockCreateWorld; }),
    };
});

vi.mock('../shared/db/index.js', () => ({ db: mockDb }));
vi.mock('./middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => { req.user = { id: 'test-user-id', email: 'test@test.com' }; next(); } }));
vi.mock('../shared/services/world-repository.js', () => ({ WorldRepository: MockWorldRepository }));
vi.mock('../shared/services/project-repository.js', () => ({ ProjectRepository: MockProjectRepository }));

const app = express();
app.use(express.json());
const mockBucket = { name: 'test-bucket', file: vi.fn(() => ({ createWriteStream: vi.fn(() => ({ on: vi.fn((event: any, cb: any) => { if (event === 'finish') setTimeout(cb, 0); return { on: vi.fn(), end: vi.fn() }; }), end: vi.fn() })) })) } as any;
const mockHttpServer = {} as any;
await registerRoutes(mockHttpServer, app, mockBucket);

describe('API Routes', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('GET /api/teams', () => {
        it('should fetch teams for the authenticated user', async () => {
            (mockDb.query.usersToTeams.findMany as any).mockResolvedValue([{ team: { id: 'team-1', name: 'My Team' } }]);
            const res = await request(app).get('/api/teams');
            expect(res.status).toBe(200);
            expect(res.body.teams).toEqual([{ id: 'team-1', name: 'My Team' }]);
        });
    });

    describe('GET /api/worlds', () => {
        it('should fetch worlds for user', async () => {
            mockGetWorldsForUser.mockResolvedValueOnce([{ id: 'w1', teamId: 'test-team-id' }, { id: 'w2', teamId: 'other-team' }]);
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });
            const res = await request(app).get('/api/worlds').set('x-team-id', 'test-team-id');
            expect(res.status).toBe(200);
            expect(res.body.worlds).toHaveLength(2);
        });
        it('should fail if x-team-id header is missing', async () => {
            const res = await request(app).get('/api/worlds');
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/worlds', () => {
        it('should create a world if user is member of team', async () => {
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });
            const res = await request(app).post('/api/worlds').set('x-team-id', 'test-team-id').send({ name: 'New World', teamId: 'test-team-id' });
            expect(res.status).toBe(201);
            expect(res.body.id).toBe('world-1');
        });
        it('should fail if user is not member of team', async () => {
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue(null);
            const res = await request(app).post('/api/worlds').set('x-team-id', 'test-team-id').send({ name: 'New World', teamId: 'test-team-id' });
            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/projects', () => {
        it('should fetch projects for user', async () => {
            mockGetProjectsForUser.mockResolvedValueOnce([{ id: 'p1', teamId: 'test-team-id' }, { id: 'p2', teamId: 'other-team' }]);
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });
            const res = await request(app).get('/api/projects').set('x-team-id', 'test-team-id');
            expect(res.status).toBe(200);
            expect(res.body.projects).toHaveLength(2);
        });
    });
});
