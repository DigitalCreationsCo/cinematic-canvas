// @vitest-environment node
// src/server/routes/api-validation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiContract, validateRequest } from "./ts-rest-adapter.js";

describe("Server Request Validation Middleware", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe("validateRequest middleware", () => {
    it("should pass valid request through", async () => {
      const testSchema = apiContract.projects.start.body;

      app.post("/test", validateRequest({ body: testSchema }), (req, res) => {
        res.json({ success: true, data: req.body });
      });

      const response = await request(app).post("/test").send({ projectId: "proj-123", initialPrompt: "test prompt" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should reject invalid request body", async () => {
      const testSchema = apiContract.projects.start.body;

      app.post("/test", validateRequest({ body: testSchema }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).post("/test").send({ initialPrompt: "test prompt" }); // missing required projectId

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation error");
    });

    it("should reject malformed JSON", async () => {
      const testSchema = apiContract.projects.start.body;

      app.post("/test", validateRequest({ body: testSchema }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).post("/test").set("Content-Type", "application/json").send("not valid json");

      expect(response.status).toBe(400);
    });
  });

  describe("Project start endpoint validation", () => {
    it("should validate projectId is required", async () => {
      const testBody = apiContract.projects.start.body;

      app.post("/start", validateRequest({ body: testBody }), (req, res) => {
        res.status(202).json({ accepted: true });
      });

      const response = await request(app).post("/start").send({ initialPrompt: "test" });

      expect(response.status).toBe(400);
      expect(response.body.details).toBeDefined();
    });

    it("should accept valid start pipeline request", async () => {
      const testBody = apiContract.projects.start.body;

      app.post("/start", validateRequest({ body: testBody }), (req, res) => {
        res.status(202).json({ accepted: true });
      });

      const response = await request(app).post("/start").send({ projectId: "proj-123", initialPrompt: "test prompt" });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(true);
    });
  });

  describe("Project stop endpoint validation", () => {
    it("should validate projectId is required", async () => {
      const testBody = apiContract.projects.stop.body;

      app.post("/stop", validateRequest({ body: testBody }), (req, res) => {
        res.status(202).json({ accepted: true });
      });

      const response = await request(app).post("/stop").send({});

      expect(response.status).toBe(400);
    });

    it("should accept valid stop pipeline request", async () => {
      const testBody = apiContract.projects.stop.body;

      app.post("/stop", validateRequest({ body: testBody }), (req, res) => {
        res.status(202).json({ accepted: true });
      });

      const response = await request(app).post("/stop").send({ projectId: "proj-123" });

      expect(response.status).toBe(202);
    });
  });

  describe("Canvas batch endpoint validation", () => {
    it("should validate batch is an array", async () => {
      const testBody = apiContract.canvas.batch.body;

      app.put("/batch", validateRequest({ body: testBody }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).put("/batch").send({ notArray: true });

      expect(response.status).toBe(400);
    });

    it("should accept valid canvas batch request", async () => {
      const testBody = apiContract.canvas.batch.body;

      app.put("/batch", validateRequest({ body: testBody }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .put("/batch")
        .send([{ idEntityTarget: "ent-1", nodeTypeTarget: "scene", valPosXTarget: 100, valPosYTarget: 200 }]);

      expect(response.status).toBe(200);
    });
  });

  describe("Entity delete endpoint validation", () => {
    it("should validate entityType is required", async () => {
      const testBody = apiContract.entities.delete.body;

      app.delete("/entities/:id", validateRequest({ body: testBody }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).delete("/entities/ent-1").send({});

      expect(response.status).toBe(400);
    });

    it("should reject invalid entityType", async () => {
      const testBody = apiContract.entities.delete.body;

      app.delete("/entities/:id", validateRequest({ body: testBody }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).delete("/entities/ent-1").send({ entityType: "invalid" });

      expect(response.status).toBe(400);
    });

    it("should accept valid entity delete request", async () => {
      const testBody = apiContract.entities.delete.body;

      app.delete("/entities/:id", validateRequest({ body: testBody }), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).delete("/entities/ent-1").send({ entityType: "character" });

      expect(response.status).toBe(200);
    });
  });

  describe("Teams joinOrCreate validation", () => {
    it("should reject empty team name", async () => {
      const testBody = apiContract.teams.joinOrCreate.body;

      app.post("/teams", validateRequest({ body: testBody }), (req, res) => {
        res.status(201).json({ created: true });
      });

      const response = await request(app).post("/teams").send({ name: "" });

      expect(response.status).toBe(400);
    });

    it("should accept valid team name", async () => {
      const testBody = apiContract.teams.joinOrCreate.body;

      app.post("/teams", validateRequest({ body: testBody }), (req, res) => {
        res.status(201).json({ created: true });
      });

      const response = await request(app).post("/teams").send({ name: "My Team" });

      expect(response.status).toBe(201);
    });
  });
});
