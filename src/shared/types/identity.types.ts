import { z } from "zod";



/**
 * Base Identity for all database-backed entities.
*/
export const IdentityBase = z.object({
  id: z.uuid({ "version": "v7" }).nonempty().nonoptional().describe("Unique identifier (uuid)"),
  createdAt: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ).default(() => new Date()),
  updatedAt: z.preprocess(
    (val) => (typeof val === "string" ? new Date(val) : val),
    z.date()
  ).default(() => new Date()),
});

export const ProjectRef = z.object({
  projectId: z.uuid({ "version": "v7" }).nonempty().nonoptional().describe("Pipeline project id"),
});
