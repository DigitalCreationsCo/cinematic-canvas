import { channelSubscriptions, mockRemoveChannel } from "#shared/mocks/mock-supabase-realtime.js";

import { describe, it, expect, vi, beforeEach } from "vitest";
let subscribeToLayoutChanges: (projectId: string, onChange: (payload: any) => void) => any;
let unsubscribeFromLayoutChanges: (projectId: string) => void;
let unsubscribeAll: () => void;
let isRealtimeConfigured: () => boolean;
let getActiveSubscriptionCount: () => number;

describe("Supabase Realtime Service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    channelSubscriptions.clear();

    // Reset module to clear channel map
    vi.resetModules();

    // Re-import after mocks are set up
    const module = await import("../supabaseRealtime.js");
    subscribeToLayoutChanges = module.subscribeToLayoutChanges;
    unsubscribeFromLayoutChanges = module.unsubscribeFromLayoutChanges;
    unsubscribeAll = module.unsubscribeAll;
    isRealtimeConfigured = module.isRealtimeConfigured;
    getActiveSubscriptionCount = module.getActiveSubscriptionCount;
  });

  describe("isRealtimeConfigured", () => {
    it("should return true when SUPABASE_SERVICE_ROLE_KEY is set", () => {
      expect(isRealtimeConfigured()).toBe(true);
    });
  });

  describe("getActiveSubscriptionCount", () => {
    it("should return 0 when no subscriptions exist", () => {
      expect(getActiveSubscriptionCount()).toBe(0);
    });

    it("should return correct count after subscribing", async () => {
      subscribeToLayoutChanges("project-1", vi.fn());
      expect(getActiveSubscriptionCount()).toBe(1);
    });

    it("should return correct count for multiple subscriptions", async () => {
      subscribeToLayoutChanges("project-1", vi.fn());
      subscribeToLayoutChanges("project-2", vi.fn());
      expect(getActiveSubscriptionCount()).toBe(2);
    });
  });

  describe("subscribeToLayoutChanges", () => {
    it("should create a new channel for project", () => {
      const onChange = vi.fn();
      const channel = subscribeToLayoutChanges("project-1", onChange);
      expect(channel).toBeDefined();
    });

    it("should reuse existing channel for same project", () => {
      const onChange = vi.fn();
      const channel1 = subscribeToLayoutChanges("project-1", onChange);
      const channel2 = subscribeToLayoutChanges("project-1", onChange);
      expect(channel1).toBe(channel2);
      expect(getActiveSubscriptionCount()).toBe(1);
    });

    it("should create separate channels for different projects", () => {
      const channel1 = subscribeToLayoutChanges("project-1", vi.fn());
      const channel2 = subscribeToLayoutChanges("project-2", vi.fn());
      expect(channel1).not.toBe(channel2);
      expect(getActiveSubscriptionCount()).toBe(2);
    });

    it("should invoke callback on INSERT event", async () => {
      const onChange = vi.fn();
      subscribeToLayoutChanges("project-1", onChange);

      const channel = channelSubscriptions.get("project-1");
      const onCallback = channel.on.mock.calls[0][2];

      onCallback({
        eventType: "INSERT",
        old: null,
        new: {
          id_entity: "entity-1",
          node_type: "scene",
          val_pos_x: 100,
          val_pos_y: 200,
          val_width: 300,
          val_height: 400,
          json_ui_metadata: { label: "Test" },
          idx_version: 1,
          context_type: "project",
          id_context: "project-1",
        },
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          idEntity: "entity-1",
          nodeType: "scene",
          valPosX: 100,
          valPosY: 200,
          valWidth: 300,
          valHeight: 400,
          jsonUiMetadata: { label: "Test" },
          idxVersion: 1,
          contextType: "project",
          contextId: "project-1",
          eventType: "INSERT",
        }),
      );
    });

    it("should invoke callback on UPDATE event", async () => {
      const onChange = vi.fn();
      subscribeToLayoutChanges("project-1", onChange);

      const channel = channelSubscriptions.get("project-1");
      const onCallback = channel.on.mock.calls[0][2];

      onCallback({
        eventType: "UPDATE",
        old: { id_entity: "entity-1" },
        new: {
          id_entity: "entity-1",
          node_type: "scene",
          val_pos_x: 150,
          val_pos_y: 250,
          idx_version: 2,
          context_type: "project",
          id_context: "project-1",
        },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          idEntity: "entity-1",
          valPosX: 150,
          valPosY: 250,
          idxVersion: 2,
          eventType: "UPDATE",
        }),
      );
    });

    it("should invoke callback on DELETE event using old row", async () => {
      const onChange = vi.fn();
      subscribeToLayoutChanges("project-1", onChange);

      const channel = channelSubscriptions.get("project-1");
      const onCallback = channel.on.mock.calls[0][2];

      onCallback({
        eventType: "DELETE",
        old: {
          id_entity: "entity-1",
          node_type: "scene",
          val_pos_x: 100,
          val_pos_y: 200,
          idx_version: 1,
          context_type: "project",
          id_context: "project-1",
        },
        new: null,
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          idEntity: "entity-1",
          eventType: "DELETE",
        }),
      );
    });

    it("should not invoke callback when row data is missing", async () => {
      const onChange = vi.fn();
      subscribeToLayoutChanges("project-1", onChange);

      const channel = channelSubscriptions.get("project-1");
      const onCallback = channel.on.mock.calls[0][2];

      onCallback({
        eventType: "INSERT",
        old: null,
        new: null,
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribeFromLayoutChanges", () => {
    it("should remove channel for project", async () => {
      subscribeToLayoutChanges("project-1", vi.fn());
      expect(getActiveSubscriptionCount()).toBe(1);

      unsubscribeFromLayoutChanges("project-1");

      expect(mockRemoveChannel).toHaveBeenCalled();
      expect(getActiveSubscriptionCount()).toBe(0);
    });

    it("should not throw for non-existent channel", () => {
      expect(() => unsubscribeFromLayoutChanges("non-existent")).not.toThrow();
    });

    it("should remove only the specified project channel", async () => {
      subscribeToLayoutChanges("project-1", vi.fn());
      subscribeToLayoutChanges("project-2", vi.fn());
      expect(getActiveSubscriptionCount()).toBe(2);

      unsubscribeFromLayoutChanges("project-1");

      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      expect(getActiveSubscriptionCount()).toBe(1);
    });
  });

  describe("unsubscribeAll", () => {
    it("should remove all channels", async () => {
      subscribeToLayoutChanges("project-1", vi.fn());
      subscribeToLayoutChanges("project-2", vi.fn());
      subscribeToLayoutChanges("project-3", vi.fn());
      expect(getActiveSubscriptionCount()).toBe(3);

      unsubscribeAll();

      expect(mockRemoveChannel).toHaveBeenCalledTimes(3);
      expect(getActiveSubscriptionCount()).toBe(0);
    });

    it("should handle empty subscriptions", () => {
      expect(() => unsubscribeAll()).not.toThrow();
    });
  });
});
