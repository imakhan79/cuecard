// Shared between server and client: the error shape every AI route returns.
export type AiErrorCode =
  | "invalid_key"
  | "rate_limit"
  | "network"
  | "overloaded"
  | "refused"
  | "unauthorized"
  | "bad_request"
  | "not_found"
  | "unknown";

export type AiError = { code: AiErrorCode; message: string };

export const AI_ERROR_TITLES: Record<AiErrorCode, string> = {
  invalid_key: "Claude API key problem",
  rate_limit: "Rate limit reached",
  network: "Network problem",
  overloaded: "Claude is busy",
  refused: "Request declined",
  unauthorized: "Signed out",
  bad_request: "Couldn't process that",
  not_found: "Not found",
  unknown: "Something went wrong",
};
