import { vi } from "vitest";

// Track subscriptions per project
export const channelSubscriptions = new Map<string, any>();

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
export const mockRemoveChannel = vi.fn();

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      channel: vi.fn((channelName: string) => {
        const projectId = channelName.split(":")[1];
        const channel = {
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn((callback?: (status: string) => void) => {
            channelSubscriptions.set(projectId, channel);
            if (callback) callback("SUBSCRIBED");
            return channel;
          }),
        };
        return channel;
      }),
      removeChannel: mockRemoveChannel,
    })),
  };
});
