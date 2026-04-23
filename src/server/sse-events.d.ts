import { IEventBus } from "#shared/messaging/event-bus.types.js";
import { z } from "zod";
export declare const createEventsRouter: ({ eventBus }: {
    eventBus: IEventBus;
}) => import("@trpc/server").TRPCBuiltRouter<{
    ctx: {
        user: import("@supabase/supabase-js").AuthUser | null;
        teamId: string | undefined;
        worldId: string | undefined;
        projectId: string | undefined;
        headers: import("http").IncomingHttpHeaders;
    };
    meta: object;
    errorShape: {
        data: {
            zodError: z.core.$ZodFlattenedError<unknown, string> | null;
            code: import("@trpc/server").TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
        };
        message: string;
        code: import("@trpc/server").TRPC_ERROR_CODE_NUMBER;
    };
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    project: import("@trpc/server").TRPCSubscriptionProcedure<{
        input: {
            projectId: string;
        };
        output: AsyncIterable<string, void, any>;
        meta: object;
    }>;
}>>;
//# sourceMappingURL=sse-events.d.ts.map