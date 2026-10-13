// Model allowlist and daily token-budget math. The model runs on a
// subscription, so the Gate meter counts tokens instead of dollars.
// Reservations use the same reserve-then-settle shape as before.

export const ALLOWED_MODELS = ["gpt-6-luna", "gpt-5.6-luna"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];
export const DEFAULT_MODEL: AllowedModel = "gpt-6-luna";

/** Output room reserved per turn: the 450-token reply hint plus tool args. */
export const REPLY_TOKEN_ALLOWANCE = 700;

/** Return the configured model, or the default when the value is not allowed. */
export function resolveModel(value: string | undefined): AllowedModel {
  return value === "gpt-6-luna" || value === "gpt-5.6-luna" ? value : DEFAULT_MODEL;
}

/** Rough token estimate for plain text, used only for reservations. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Tokens reserved for one turn: input estimate plus the reply allowance. */
export function reservationTokens(inputEstimate: number): number {
  const input =
    typeof inputEstimate === "number" && Number.isFinite(inputEstimate) && inputEstimate > 0
      ? Math.floor(inputEstimate)
      : 0;
  return input + REPLY_TOKEN_ALLOWANCE;
}

export interface UsageTokensInput {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

function tokenCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Total tokens charged for a turn from upstream usage. Bad values count as 0. */
export function usageTokens(usage: UsageTokensInput | null | undefined): number {
  if (usage === null || usage === undefined) return 0;
  return tokenCount(usage.prompt_tokens) + tokenCount(usage.completion_tokens);
}

/**
 * Tokens to charge for a finished or failed turn. Real usage wins when it is
 * above zero. Otherwise, any streamed output (text, tool call, refusal, or
 * usage) settles at the full reservation; a clean failure before the stream
 * settles at zero.
 */
export function turnTokens(
  usage: UsageTokensInput | null | undefined,
  sawStreamEvent: boolean,
  reservation: number,
): number {
  const charged = usageTokens(usage);
  if (charged > 0) return charged;
  return sawStreamEvent ? Math.max(0, Math.floor(reservation)) : 0;
}
