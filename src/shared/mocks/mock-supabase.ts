import { vi } from "vitest";

const { getSession, supabase, createClient } = vi.hoisted(() => {
  const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
  return {
    supabase: {
      auth: {
        getSession,
      },
    },
    createClient: vi.fn(() => ({
      auth: {
        getSession,
      },
    })),
    getSession,
  };
});

vi.mock("#client/lib/supabase.js", () => ({
  supabase,
  createClient,
  getSession,
}));

export { getSession, supabase, createClient };
