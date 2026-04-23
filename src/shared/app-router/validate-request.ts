import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'

type RouteDef = {
    body?: z.ZodTypeAny
    query?: z.ZodTypeAny
    pathParams?: z.ZodTypeAny
}

/**
 * Extract inferred types
 */
type InferBody<T extends RouteDef> =
    T['body'] extends z.ZodTypeAny ? z.infer<T['body']> : unknown

type InferQuery<T extends RouteDef> =
    T['query'] extends z.ZodTypeAny ? z.infer<T['query']> : unknown

type InferParams<T extends RouteDef> =
    T['pathParams'] extends z.ZodTypeAny ? z.infer<T['pathParams']> : unknown

/**
 * Middleware
 */
export function validateRequest<T extends RouteDef>(route: T) {
    return (
        req: Request<
            InferParams<T>,
            any,
            InferBody<T>,
            InferQuery<T>
        >,
        res: Response,
        next: NextFunction
    ) => {
        try {
            if (route.body) {
                req.body = route.body.parse(req.body) as InferBody<T>
            }

            if (route.query) {
                req.query = route.query.parse(req.query) as InferQuery<T>
            }

            if (route.pathParams) {
                req.params = route.pathParams.parse(req.params) as InferParams<T>
            }

            next()
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation error',
                    details: error.issues
                })
            } else {
                next(error)
            }
        }
    }
}