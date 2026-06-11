import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";

// Parse req.body against a generated @workspace/api-zod schema. A ZodError
// thrown here is mapped to a 400 with flattened issues by the app-level error
// handler. On success req.body is replaced with the parsed (stripped) value.
// P is `any` so this composes with Express 5's literal-route param inference
// (a ParamsDictionary-typed middleware degrades :id params to string|string[]).
export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler<any> {
  return (req, _res, next) => {
    req.body = schema.parse(req.body) as z.infer<T>;
    next();
  };
}
