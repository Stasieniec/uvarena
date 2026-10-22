// STUB (Client app package). Typed fetch helpers built from `endpoints` in
// src/shared/api-schemas.ts. Non-2xx responses carry ApiErrorSchema.
import type { ApiError, EndpointBody, EndpointName, EndpointQuery, EndpointResponse } from "@shared/api-schemas";
import { notImplemented } from "@shared/not-implemented";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null) {
    super(body?.error.message ?? `HTTP ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestArgs<N extends EndpointName> {
  /** Values for :params in the path. */
  params?: Record<string, string>;
  query?: EndpointQuery<N>;
  body?: EndpointBody<N>;
  signal?: AbortSignal;
}

/** Calls an endpoint by name, validates the response with its schema, throws ApiRequestError on failure. */
export async function apiRequest<N extends EndpointName>(name: N, args?: RequestArgs<N>): Promise<EndpointResponse<N>> {
  void name; void args;
  return notImplemented("client.apiRequest");
}
