// Model allowlist and spend math. Prices are USD per 1M tokens.
// Cache writes cost ~1.25x the input price, cache reads ~0.1x.

export const ALLOWED_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];
export const DEFAULT_MODEL: AllowedModel = "claude-haiku-5-5";

export const PRICES_PER_MILLION_USD: Record<AllowedModel, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/** Return the configured model, or the default when the value is not allowed. */
export function resolveModel(value: string | undefined): AllowedModel {
  return value === "claude-haiku-5-5" || value === "claude-sonnet-5-5" ? value : DEFAULT_MODEL;
}

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

function tokens(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Cost in micro-USD (1 USD = 1,000,000 micro-USD), rounded up so the spend
 * meter never undercounts. With prices per 1M tokens, micro-USD equals
 * tokens * pricePerMillion summed over each token class.
 */
export function costMicroUsd(model: AllowedModel, usage: TokenUsage): number {
  const price = PRICES_PER_MILLION_USD[model];
  const micro =
    tokens(usage.input_tokens) * price.input +
    tokens(usage.cache_creation_input_tokens) * price.input * CACHE_WRITE_MULTIPLIER +
    tokens(usage.cache_read_input_tokens) * price.input * CACHE_READ_MULTIPLIER +
    tokens(usage.output_tokens) * price.output;
  return Math.ceil(micro);
}

/** Rough token estimate for plain text, used only for spend reservations. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Worst-case cost of one turn in micro-USD: every input token billed at the
 * cache-write price and the full output budget billed at the output price.
 */
export function worstCaseMicroUsd(
  model: AllowedModel,
  estimatedInputTokens: number,
  maxOutputTokens: number,
): number {
  const price = PRICES_PER_MILLION_USD[model];
  const input = Math.max(0, Math.floor(estimatedInputTokens));
  const output = Math.max(0, Math.floor(maxOutputTokens));
  return Math.ceil(input * price.input * CACHE_WRITE_MULTIPLIER + output * price.output);
}
