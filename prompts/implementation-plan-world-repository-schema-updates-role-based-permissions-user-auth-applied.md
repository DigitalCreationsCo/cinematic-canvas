100% completed and detailed implementation plan to add Supabase Authentication, Team/User scoping, Granular Permissions, and World Data management to the Cinematic Canvas application.
Phase 1: Authentication & Identity Setup (Supabase)
Goal: Implement Supabase Auth, build the login flow, and establish the current user session context across the frontend and backend.
1. Supabase Integration
   * Install Dependencies: npm install @supabase/supabase-js
   * Environment Setup: Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to .env.
   * Client Initialization: Create src/client/src/lib/supabase.ts exposing createClient().
2. Frontend Authentication Flow
   * Update App.tsx: Wrap the application in a new <AuthProvider> that listens to Supabase session state (onAuthStateChange). If no session exists, display the new Start Screen.
   * Start Screen Component: Create src/client/src/pages/auth/AuthScreen.tsx.
     * Step 1: Big "Start" button.
     * Step 2: Email Magic Link input or standard Email/Password form (using Supabase Auth UI).
   * Team Onboarding: Create src/client/src/pages/auth/TeamSetup.tsx. 
     * Displayed immediately after successful login if the user has no teams.
     * Form: "Enter a new or existing team name."
     * Action: Calls new backend endpoint POST /api/teams/join-or-create.
3. Backend Middleware
   * Auth Middleware (src/server/middleware/auth.ts): 
     * Extract the Bearer token (JWT) from incoming requests.
     * Verify the token using @supabase/supabase-js (with the service role key).
     * Attach the user object to the Express Request object (req.user = { id, email }).
   * Apply this middleware to all /api/* routes in src/server/routes.ts.
Phase 2: Database Schema Expansion (Users, Teams & Permissions)
Goal: Update Drizzle schema to support Teams, Worlds, and granular RBAC (Role-Based Access Control) permissions.
1. Update src/shared/db/schema.ts
   * Teams Table: Create teams table (id, name, createdAt).
   * Users Table: Ensure users table maps to Supabase Auth user IDs. (Change id: uuid to map directly to Supabase's auth.users.id).
   * Team Memberships: Create users_to_teams join table (userId, teamId, role enum: 'owner', 'admin', 'member').
   * Link Projects/Worlds to Teams: Add teamId: uuid().notNull() to the projects and worlds tables.
   * Granular Permissions: Update users_to_projects and users_to_worlds.
     * Add accessLevel column (Enum: 'read', 'write') to both tables.
2. Database Migration
   * Run npm run db:push to apply the schema.
   * Note: A future migration script will assign orphaned projects to a default system user/team as specified.
Phase 3: World & Project Repositories (Backend Logic)
Goal: Implement the logic to create, fetch, and validate Worlds and Projects scoped to Teams and permissions.
1. WorldRepository Class (src/shared/services/world-repository.ts)
   * Create: createWorld(data: { name, description, teamId, userId })
     * Generates a unique worldRepository ID string (e.g., wrld_${crypto.randomUUID()}).
     * Inserts into worlds table.
     * Automatically assigns 'write' permission to the creator in users_to_worlds.
   * Fetch: getWorldsForUser(userId: string)
     * Joins worlds with teams and users_to_worlds.
     * Returns worlds where the user is a member of the owning team OR has explicit permission via users_to_worlds.
2. Update ProjectRepository Class
   * Create: Update createProject to accept teamId and optional worldId.
     * Automatically assigns 'write' permission to the creator in users_to_projects.
   * Fetch: Update getProjects to getProjectsForUser(userId: string, filterWorldId?: string).
     * Joins projects with teams and users_to_projects.
     * Applies standard access logic: User must be in the owning team OR have an explicit entry in users_to_projects.
     * If filterWorldId is provided, filter the results strictly to that world.
3. API Endpoints (src/server/routes.ts)
   * POST /api/teams/join-or-create: Handles the Team Setup step after login.
   * POST /api/worlds: Calls WorldRepository.createWorld.
   * GET /api/worlds: Calls WorldRepository.getWorldsForUser.
   * GET /api/projects: Update to use req.user.id and handle ?worldId= query param.
Phase 4: Frontend Integration & App Flow
Goal: Tie the new APIs into the React UI, completing the "World Builder" and project selection experiences.
1. API Hooks (src/client/src/hooks/use-swr-api.ts)
   * Add useWorlds() hook to fetch from GET /api/worlds.
   * Update useProjects(worldId?: string) to pass the query parameter.
   * Ensure fetcher functions attach the Supabase JWT token to the Authorization: Bearer header.
2. Zustand Store (src/client/src/lib/store.ts)
   * Add activeWorldId: string | null to the store.
   * Add activeTeamId: string | null to the store.
3. World Builder Flow (src/client/src/pages/worlds/WorldBuilder.tsx)
   * Initialize a blank canvas.
   * Save Trigger: When the user creates the first asset/character/location and hits "Save":
     * Check if activeWorldId exists. If not:
     * Pop open a new <CreateWorldModal> asking for Name and Description.
     * Submit to POST /api/worlds.
     * Update activeWorldId with the new ID, close modal, and resume saving the asset to the new world.
4. Selection Modals Updates
   * SelectWorldModal: Replace mock data with data from useWorlds(). Remove the projectsCount badge.
   * ProjectSelectionModal: 
     * Update data to use useProjects(activeWorldId).
     * If opened from StartModal (Orphan Projects), pass undefined to fetch all accessible projects.
     * If opened from a World card, pass the world.id to fetch only that world's projects.
     * Update the "Create & Start Project" handler (handleCreateProject) to pass activeWorldId in the API payload if one is selected.
Summary of Constraints Addressed:
* Constraint 1 (Project/World Independence): Projects can have worldId: null. Worlds can have zero projects.
* Constraint 2 (Filtering): The UI filters projects by world when applicable.
* Constraint 3 (Permissions & Scoping): The backend strictly enforces team scoping and granular user-level overrides (users_to_projects, users_to_worlds).
* Constraint 4 (World Repo ID): worldRepository is uniquely generated upon saving a world with content.
* Constraint 5 (Supabase): Full integration with Supabase Auth for identity management.
This plan leaves no ambiguities and provides the exact roadmap to implement the specified architecture.