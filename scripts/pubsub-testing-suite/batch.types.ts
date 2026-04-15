/**
 * Batch Operations Type Definitions
 * Use these types when creating batch operation files programmatically
 */

import type { JobEvent, JobType } from "../../src/shared/types/job.types.js";

// ============================================================================
// OPERATION TYPES
// ============================================================================

export type ScenarioName = "minimal" | "rich" | "audio";

export type JobEventType = JobEvent['state'];

// ============================================================================
// OPERATION PARAMETER TYPES
// ============================================================================

export interface FullStateParams {
  scenario?: ScenarioName;
  projectId?: string;
}

export interface JobEventParams {
  eventType: JobEventType;
  jobId: string;
  projectId?: string;
  error?: string;
}

export interface DispatchJobParams {
  jobType: JobType;
  projectId?: string;
}

export interface WorkflowParams {
  projectId?: string;
  audio?: boolean;
  scenes?: number;
}

// ============================================================================
// OPERATION DEFINITIONS
// ============================================================================

export interface FullStateOperation {
  type: "full-state";
  description?: string;
  params: FullStateParams;
}

export interface JobEventOperation {
  type: "job-event";
  description?: string;
  params: JobEventParams;
}

export interface DispatchJobOperation {
  type: "dispatch-job";
  description?: string;
  params: DispatchJobParams;
}

export interface WorkflowOperation {
  type: "workflow";
  description?: string;
  params: WorkflowParams;
}

export type BatchOperation =
  | FullStateOperation
  | JobEventOperation
  | DispatchJobOperation
  | WorkflowOperation;

// ============================================================================
// BATCH FILE SCHEMA
// ============================================================================

export interface BatchFile {
  $schema?: string;
  description?: string;
  operations: BatchOperation[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a full-state operation
 */
export function createFullStateOperation(
  params: FullStateParams,
  description?: string
): FullStateOperation {
  return {
    type: "full-state",
    description,
    params,
  };
}

/**
 * Create a job-event operation
 */
export function createJobEventOperation(
  params: JobEventParams,
  description?: string
): JobEventOperation {
  return {
    type: "job-event",
    description,
    params,
  };
}

/**
 * Create a dispatch-job operation
 */
export function createDispatchJobOperation(
  params: DispatchJobParams,
  description?: string
): DispatchJobOperation {
  return {
    type: "dispatch-job",
    description,
    params,
  };
}

/**
 * Create a workflow operation
 */
export function createWorkflowOperation(
  params: WorkflowParams,
  description?: string
): WorkflowOperation {
  return {
    type: "workflow",
    description,
    params,
  };
}

/**
 * Create a complete batch file
 */
export function createBatchFile(
  operations: BatchOperation[],
  description?: string
): BatchFile {
  return {
    $schema: "./batch-schema.json",
    description,
    operations,
  };
}

// ============================================================================
// EXAMPLES
// ============================================================================

/**
 * Example: Complete pipeline test
 */
export const exampleCompletePipeline: BatchFile = createBatchFile(
  [
    createFullStateOperation(
      { scenario: "rich", projectId: "pipeline-test-001" },
      "Create rich storyboard project"
    ),
    createDispatchJobOperation(
      { jobType: "EXPAND_CREATIVE_PROMPT", projectId: "pipeline-test-001" },
      "Expand creative prompt"
    ),
    createDispatchJobOperation(
      { jobType: "GENERATE_STORYBOARD", projectId: "pipeline-test-001" },
      "Generate storyboard"
    ),
    createDispatchJobOperation(
      { jobType: "ENHANCE_STORYBOARD", projectId: "pipeline-test-001" },
      "Enhance storyboard"
    ),
  ],
  "Complete pipeline test with job chain"
);

/**
 * Example: Multi-project test
 */
export const exampleMultiProject: BatchFile = createBatchFile(
  [
    createWorkflowOperation(
      { projectId: "project-a", audio: false, scenes: 3 },
      "Standard workflow for project A"
    ),
    createWorkflowOperation(
      { projectId: "project-b", audio: true, scenes: 5 },
      "Audio workflow for project B"
    ),
    createWorkflowOperation(
      { projectId: "project-c", audio: false, scenes: 7 },
      "Large workflow for project C"
    ),
  ],
  "Test multiple projects with different configurations"
);

/**
 * Example: Job lifecycle test
 */
export const exampleJobLifecycle: BatchFile = createBatchFile(
  [
    createFullStateOperation(
      { scenario: "minimal", projectId: "lifecycle-test" },
      "Create minimal project"
    ),
    createJobEventOperation(
      {
        eventType: "JOB_DISPATCHED",
        jobId: "job-001",
        projectId: "lifecycle-test"
      },
      "Dispatch job"
    ),
    createJobEventOperation(
      { eventType: "JOB_STARTED", jobId: "job-001" },
      "Start job"
    ),
    createJobEventOperation(
      {
        eventType: "JOB_COMPLETED",
        jobId: "job-001",
        projectId: "lifecycle-test"
      },
      "Complete job"
    ),
  ],
  "Test complete job lifecycle"
);

/**
 * Example: Error scenario test
 */
export const exampleErrorScenario: BatchFile = createBatchFile(
  [
    createFullStateOperation(
      { scenario: "rich", projectId: "error-test" },
      "Create project"
    ),
    createJobEventOperation(
      {
        eventType: "JOB_DISPATCHED",
        jobId: "failing-job",
        projectId: "error-test"
      },
      "Dispatch job that will fail"
    ),
    createJobEventOperation(
      {
        eventType: "JOB_STARTED",
        jobId: "failing-job"
      },
      "Start job"
    ),
    createJobEventOperation(
      {
        eventType: "JOB_FAILED",
        jobId: "failing-job",
        projectId: "error-test",
        error: "Simulated API timeout error"
      },
      "Fail job with error"
    ),
  ],
  "Test error handling and failure scenarios"
);

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a batch operation
 */
export function validateBatchOperation(op: unknown): op is BatchOperation {
  if (typeof op !== "object" || op === null) return false;

  const operation = op as Partial<BatchOperation>;

  if (!operation.type) return false;

  const validTypes: BatchOperation["type"][] = [
    "full-state",
    "job-event",
    "dispatch-job",
    "workflow"
  ];

  if (!validTypes.includes(operation.type)) return false;

  if (!operation.params || typeof operation.params !== "object") return false;

  return true;
}

/**
 * Validate a batch file
 */
export function validateBatchFile(file: unknown): file is BatchFile {
  if (typeof file !== "object" || file === null) return false;

  const batchFile = file as Partial<BatchFile>;

  if (!Array.isArray(batchFile.operations)) return false;

  return batchFile.operations.every(validateBatchOperation);
}