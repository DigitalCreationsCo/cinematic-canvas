// @vitest-environment node
// src/server/routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes.js';
import * as schema from '../shared/db/schema.js';

// Define hoisted mocks
const {
    mockDb,
    MockProjectRepository,
    MockWorldRepository,
    mockGetProjectsForUser,
    mockCreateProject,
    mockGetWorldsForUser,
    mockCreateWorld
} = vi.hoisted(() => {
    const mockGetProjectsForUser = vi.fn().mockResolvedValue([]);
    const mockCreateProject = vi.fn().mockResolvedValue({ id: 'proj-1' });
    const mockGetWorldsForUser = vi.fn().mockResolvedValue([]);
    const mockCreateWorld = vi.fn().mockResolvedValue({ id: 'world-1' });

    return {
        mockDb: {
            query: {
                usersToTeams: {
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                },
                teams: {
                    findFirst: vi.fn(),
                },
            },
            insert: vi.fn(() => ({
                values: vi.fn(() => ({
                    onConflictDoNothing: vi.fn().mockResolvedValue([]),
                })),
            })),
            transaction: vi.fn(async (callback) => {
                const txMock = {
                    insert: vi.fn(() => ({
                        values: vi.fn(() => ({
                            returning: vi.fn().mockResolvedValue([ { id: 'team-1' } ]),
                            onConflictDoNothing: vi.fn().mockResolvedValue([]),
                        })),
                    })),
                };
                return await callback(txMock);
            }),
        },
        mockGetProjectsForUser,
        mockCreateProject,
        mockGetWorldsForUser,
        mockCreateWorld,
        MockProjectRepository: vi.fn().mockImplementation(function (this: any) {
            this.getProjectsForUser = mockGetProjectsForUser;
            this.createProject = mockCreateProject;
        }),
        MockWorldRepository: vi.fn().mockImplementation(function (this: any) {
            this.getWorldsForUser = mockGetWorldsForUser;
            this.createWorld = mockCreateWorld;
        }),
    };
});

// Mock dependencies
vi.mock('../shared/db/index.js', () => ({
    db: mockDb
}));

vi.mock('./middleware/auth.js', () => ({
    requireAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-user-id', email: 'test@test.com' };
        next();
    }
}));

vi.mock('../shared/services/world-repository.js', () => ({
    WorldRepository: MockWorldRepository
}));
vi.mock('../shared/services/project-repository.js', () => ({
    ProjectRepository: MockProjectRepository
}));

const app = express();
app.use(express.json());

const mockBucket = {
    name: 'test-bucket',
    file: vi.fn(() => ({
        createWriteStream: vi.fn(() => {
            const stream = {
                on: vi.fn((event, cb) => {
                    if (event === 'finish') setTimeout(cb, 0);
                    return stream;
                }),
                end: vi.fn()
            };
            return stream;
        })
    }))
} as any;
const mockHttpServer = {} as any;

// Await route registration
await registerRoutes(mockHttpServer, app, mockBucket);

describe('API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/teams', () => {
        it('should fetch teams for the authenticated user', async () => {
            const mockUserTeams = [ { team: { id: 'team-1', name: 'My Team' } } ];
            (mockDb.query.usersToTeams.findMany as any).mockResolvedValue(mockUserTeams);

            const res = await request(app).get('/api/teams');
            expect(res.status).toBe(200);
            expect(res.body.teams).toEqual([ { id: 'team-1', name: 'My Team' } ]);
        });
    });

    describe('POST /api/teams/join-or-create', () => {
        it('should create a new team if it does not exist', async () => {
            (mockDb.query.teams.findFirst as any).mockResolvedValue(null);

            const res = await request(app)
                .post('/api/teams/join-or-create')
                .send({ name: 'New Team' });
            expect(res.status).toBe(201);
            expect(res.body.name).toBe('New Team');
            expect(mockDb.transaction).toHaveBeenCalled();
        });

        it('should join an existing team if user is not a member', async () => {
            const existingTeam = { id: 'team-exist', name: 'Existing Team' };
            (mockDb.query.teams.findFirst as any).mockResolvedValue(existingTeam);
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue(null); // Not a member

            const res = await request(app)
                .post('/api/teams/join-or-create')
                .send({ name: 'Existing Team' });

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(existingTeam.id);
        });
    });

    describe('GET /api/worlds', () => {
        it('should fetch worlds for user filtered by team', async () => {
            mockGetWorldsForUser.mockResolvedValueOnce([
                { id: 'w1', teamId: 'test-team-id' },
                { id: 'w2', teamId: 'other-team' }
            ]);

            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });

            const res = await request(app)
                .get('/api/worlds')
                .set('x-team-id', 'test-team-id');

            expect(res.status).toBe(200);
            expect(res.body.worlds).toHaveLength(1);
            expect(res.body.worlds[ 0 ].id).toBe('w1');
        });

        it('should fail if x-team-id header is missing', async () => {
            const res = await request(app).get('/api/worlds');
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/worlds', () => {
        it('should create a world if user is member of team', async () => {
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });

            const res = await request(app)
                .post('/api/worlds')
                .set('x-team-id', 'test-team-id')
                .send({ name: 'New World', teamId: 'test-team-id' });

            expect(res.status).toBe(201);
            expect(res.body.id).toBe('world-1');
        });

        it('should fail if user is not member of team', async () => {
            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue(null);

            const res = await request(app)
                .post('/api/worlds')
                .set('x-team-id', 'test-team-id')
                .send({ name: 'New World', teamId: 'test-team-id' });

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/projects', () => {
        it('should fetch projects filtered by team', async () => {
            mockGetProjectsForUser.mockResolvedValueOnce([
                { id: 'p1', teamId: 'test-team-id' },
                { id: 'p2', teamId: 'other-team' }
            ]);

            (mockDb.query.usersToTeams.findFirst as any).mockResolvedValue({ userId: 'test-user-id' });

            const res = await request(app)
                .get('/api/projects')
                .set('x-team-id', 'test-team-id');

            expect(res.status).toBe(200);
            expect(res.body.projects).toHaveLength(1);
            expect(res.body.projects[ 0 ].id).toBe('p1');
        });
    });
});
