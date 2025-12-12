import { type User, type InsertUser } from "@shared/schema";
import { type Scene, type Character, type Location, type WorkflowMetrics, type SceneStatus, type PipelineMessage, VideoMetadata } from "@shared/pipeline-types";
import { randomUUID } from "crypto";
import { SAMPLE_STORYBOARD } from "./sample";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getMetadata(): Promise<VideoMetadata>;
  getScenes(): Promise<Scene[]>;
  getCharacters(): Promise<Character[]>;
  getLocations(): Promise<Location[]>;
  getMetrics(): Promise<WorkflowMetrics>;
  getSceneStatuses(): Promise<Record<number, SceneStatus>>;
  getMessages(): Promise<PipelineMessage[]>;
  getProjects(): Promise<string[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private metadata: VideoMetadata;
  private scenes: Scene[];
  private characters: Character[];
  private locations: Location[];
  private metrics: WorkflowMetrics;
  private sceneStatuses: Record<number, SceneStatus>;
  private messages: PipelineMessage[];
  private projects: string[];

  constructor() {
    this.users = new Map();
    this.metadata = SAMPLE_STORYBOARD.metadata;
    this.scenes = SAMPLE_STORYBOARD.scenes;
    this.characters = SAMPLE_STORYBOARD.characters;
    this.locations = SAMPLE_STORYBOARD.locations;
    this.metrics = {
      sceneMetrics: [
        { sceneId: 1, attempts: 2, bestAttempt: 2, finalScore: 92, duration: 45, ruleAdded: false },
        { sceneId: 2, attempts: 1, bestAttempt: 1, finalScore: 88, duration: 38, ruleAdded: false },
        { sceneId: 3, attempts: 4, bestAttempt: 4, finalScore: 85, duration: 120, ruleAdded: true },
      ],
      attemptMetrics: [{ sceneId: 1, attemptNumber: 1, finalScore: 88, duration: 8}],
      globalTrend: {
        averageAttempts: 2.3,
        attemptTrendSlope: -0.15,
        qualityTrendSlope: 0.05,
      },
      trendHistory: [ { averageAttempts: 2, attemptTrendSlope: -1.1, qualityTrendSlope: 1.2 } ],
      regression: {
        count: 0,
        sumX: 0,
        sumY_a: 0,
        sumY_q: 0,
        sumXY_a: 0,
        sumXY_q: 0,
        sumX2: 0,
      },
    };
    this.sceneStatuses = {
        1: "complete",
        2: "complete",
        3: "complete",
        4: "generating",
        5: "pending",
        6: "pending",
    };
    this.messages = [
        { id: "1", type: "info", message: "Pipeline initialized - analyzing 6 scenes", timestamp: new Date(Date.now() - 120000) },
        { id: "2", type: "success", message: "Scene 1 generation complete (2 attempts)", timestamp: new Date(Date.now() - 90000), sceneId: 1 },
        { id: "3", type: "success", message: "Scene 2 generation complete (1 attempt)", timestamp: new Date(Date.now() - 60000), sceneId: 2 },
        { id: "4", type: "warning", message: "Scene 3 required 4 attempts - character consistency issues", timestamp: new Date(Date.now() - 30000), sceneId: 3 },
        { id: "5", type: "info", message: "Generating scene 4...", timestamp: new Date(), sceneId: 4 },
    ];
    this.projects = ["The Wall of Glass", "Project Beta", "Project Gamma"];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getMetadata(): Promise<VideoMetadata> { return this.metadata; }
  async getScenes(): Promise<Scene[]> { return this.scenes; }
  async getCharacters(): Promise<Character[]> { return this.characters; }
  async getLocations(): Promise<Location[]> { return this.locations; }
  async getMetrics(): Promise<WorkflowMetrics> { return this.metrics; }
  async getSceneStatuses(): Promise<Record<number, SceneStatus>> { return this.sceneStatuses; }
  async getMessages(): Promise<PipelineMessage[]> { return this.messages; }
  async getProjects(): Promise<string[]> { return this.projects; }
}

export const storage = new MemStorage();
