// Site-agent Worker entry. Serves the static site through ASSETS and
// handles three /api/agent routes. Every other /api path is a 404.

import Anthropic from "@anthropic-ai/sdk";
import {
  isOriginAllowed,
  isSecFetchSiteOk,
  isValidSessionId,
  isValidTurnstileToken,
  MAX_BODY_BYTES,
  normalizeMessage,
  parseSitePaths,
} from "./guard.ts";
import { parseDailyMessageCap, parseDailySpendCapMicro, utcDay } from "./limits.ts";
import {
  costMicroUsd,
  estimateTokens,
  resolveModel,
  worstCaseMicroUsd,
  type AllowedModel,
} from "./pricing.ts";
import { buildSystemBlock, REFUSAL_FALLBACK_TEXT } from "./prompt.ts";
import { encodeSseBytes } from "./sse.ts";
import { buildTools, validateToolAction } from "./tools.ts";
import type { Env, ErrorCode, GateApi, HistoryMessage } from "./types.ts";

export { Gate } from "./gate.ts";

const MAX_TOKENS = 450;
const TURN_TIMEOUT_MS = 25_000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_HOSTNAMES: ReadonlySet<string> = new Set([
  "sergeserbinenko.com",
  "www.sergeserbinenko.com",
]);

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  bad_request: "That request could not be read.",
  forbidden: "This agent only answers from sergeserbinenko.com.",
  bot_check_failed: "The bot check failed. Reload the page and try again.",
  rate_limited: "Slow down a little, then try again.",
  session_expired: "That chat has expired. Start a new one.",
  session_limit: "This chat is out of messages. Start a new one.",
  daily_limit: "You have reached today's limit for this agent.",
  resting: "The agent is resting. Try again tomorrow.",
  too_long: "Keep it short — this agent only answers questions about Serge and his work.",
  upstream_error: "The agent hit a snag. Try again in a moment.",
};

const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  bot_check_failed: 403,
  rate_limited: 429,
  session_expired: 401,
  session_limit: 429,
  daily_limit: 429,
  resting: 503,
  too_long: 400,
  upstream_error: 502,
};

function jsonError(code: ErrorCode, message?: string, retryAfter?: number): Response {
  const error: { code: ErrorCode; message: string; retryAfter?: number } = {
    code,
    message: message ?? ERROR_MESSAGES[code],
  };
  if (retryAfter !== undefined) error.retryAfter = retryAfter;
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify({ error }), { status: ERROR_STATUS[code], headers });
}

function jsonOk(body: unknown, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cacheControl },
  });
}

function gateStub(env: Env): GateApi {
  return env.GATE.getByName("global") as unknown as GateApi;
}

function isEnabled(env: Env): boolean {
  return env.AGENT_ENABLED === "true";
}

/** Guards shared by the two POST routes. Returns the client IP or an error. */
function postGuard(request: Request, env: Env): { ip: string } | { response: Response } {
  const dev = env.DEV === "true";
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { response: jsonError("bad_request") };
  }
  if (!isOriginAllowed(request.headers.get("Origin"), dev)) {
    return { response: jsonError("forbidden") };
  }
  if (!isSecFetchSiteOk(request.headers.get("Sec-Fetch-Site"))) {
    return { response: jsonError("forbidden") };
  }
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip === null || ip === "") {
    if (!dev) return { response: jsonError("forbidden") };
    return { ip: "127.0.0.1" };
  }
  return { ip };
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number.parseInt(request.headers.get("Content-Length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("too_long") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError("too_long") };
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, response: jsonError("bad_request") };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, response: jsonError("bad_request") };
  }
}

/** Workers Rate Limiting check. Binding errors fall through to Gate limits. */
async function rateLimitOk(limiter: RateLimit, key: string): Promise<boolean> {
  try {
    const outcome = await limiter.limit({ key });
    return outcome.success;
  } catch {
    return true;
  }
}

interface TurnstileResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
}

async function verifyTurnstile(env: Env, token: string, ip: string): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  if (secret === undefined || secret === "") return false;
  const dev = env.DEV === "true";
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as TurnstileResponse;
    if (data.success !== true) return false;
    if (!dev && (data.hostname === undefined || !TURNSTILE_HOSTNAMES.has(data.hostname))) {
      return false;
    }
    if (typeof data.action === "string" && data.action !== "" && data.action !== "agent") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

let knowledgeCache: { text: string; paths: string[] } | null = null;

/** Load the build-time knowledge text from static assets, once per isolate. */
async function loadKnowledge(env: Env): Promise<{ text: string; paths: string[] }> {
  if (knowledgeCache !== null) return knowledgeCache;
  const response = await env.ASSETS.fetch(new Request("https://assets.local/agent-context.txt"));
  if (!response.ok) throw new Error("knowledge unavailable");
  const text = await response.text();
  if (text.length === 0) throw new Error("knowledge empty");
  knowledgeCache = { text, paths: parseSitePaths(text) };
  return knowledgeCache;
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const guard = postGuard(request, env);
  if ("response" in guard) return guard.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const token = body.value.turnstileToken;
  if (!isValidTurnstileToken(token)) return jsonError("bot_check_failed");
  const human = await verifyTurnstile(env, token, guard.ip);
  if (!human) return jsonError("bot_check_failed");
  if (!(await rateLimitOk(env.RL_SESSION, guard.ip))) {
    return jsonError("rate_limited", undefined, 60);
  }
  const result = await gateStub(env).createSession({
    ip: guard.ip,
    now: Date.now(),
    enabled: isEnabled(env),
  });
  if (!result.ok) return jsonError(result.code, undefined, result.retryAfter);
  return jsonOk({
    sessionId: result.sessionId,
    expiresAt: new Date(result.expiresAt).toISOString(),
    remaining: result.remaining,
  });
}

interface StreamChatArgs {
  env: Env;
  ctx: ExecutionContext;
  requestSignal: AbortSignal;
  sessionId: string;
  message: string;
  history: HistoryMessage[];
  remaining: number;
  model: AllowedModel;
  knowledge: string;
  paths: string[];
  reservationMicro: number;
}

function streamChat(args: StreamChatArgs): Response {
  const gate = gateStub(args.env);
  let abortUpstream: (() => void) | null = null;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      let stopReason = "unknown";
      let actualMicro = 0;
      let reason = "ok";
      let abortKind: "" | "timeout" | "client_abort" = "";
      let sawStreamEvent = false;
      const usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };
      const client = new Anthropic({ apiKey: args.env.ANTHROPIC_API_KEY, maxRetries: 1 });
      const messages: Anthropic.MessageParam[] = [
        ...args.history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: args.message },
      ];
      const claudeStream = client.messages.stream({
        model: args.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        system: buildSystemBlock(args.knowledge),
        tools: buildTools(args.paths),
        messages,
      });
      abortUpstream = () => claudeStream.abort();
      const timer = setTimeout(() => {
        abortKind = "timeout";
        claudeStream.abort();
      }, TURN_TIMEOUT_MS);
      const onClientAbort = (): void => {
        abortKind = "client_abort";
        claudeStream.abort();
      };
      args.requestSignal.addEventListener("abort", onClientAbort);
      try {
        for await (const event of claudeStream) {
          sawStreamEvent = true;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            controller.enqueue(encodeSseBytes("text", { delta: event.delta.text }));
          }
        }
        const final = await claudeStream.finalMessage();
        stopReason = final.stop_reason ?? "unknown";
        usage.input_tokens = final.usage.input_tokens ?? 0;
        usage.output_tokens = final.usage.output_tokens;
        usage.cache_creation_input_tokens = final.usage.cache_creation_input_tokens ?? 0;
        usage.cache_read_input_tokens = final.usage.cache_read_input_tokens ?? 0;
        actualMicro = costMicroUsd(args.model, final.usage);
        if (assistantText === "") {
          assistantText = final.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
          if (assistantText !== "") {
            controller.enqueue(encodeSseBytes("text", { delta: assistantText }));
          }
        }
        if (stopReason === "refusal") {
          reason = "refusal";
          if (assistantText === "") {
            assistantText = REFUSAL_FALLBACK_TEXT;
            controller.enqueue(encodeSseBytes("text", { delta: assistantText }));
          }
        }
        for (const block of final.content) {
          if (block.type === "tool_use") {
            const action = validateToolAction(block.name, block.input, args.paths);
            if (action !== null) controller.enqueue(encodeSseBytes("action", action));
            break;
          }
        }
        controller.enqueue(
          encodeSseBytes("done", { remaining: args.remaining, stop: stopReason }),
        );
      } catch (error) {
        if (abortKind !== "") {
          reason = abortKind;
        } else if (error instanceof Anthropic.RateLimitError) {
          reason = "upstream_rate_limit";
        } else if (error instanceof Anthropic.APIError) {
          reason = `upstream_${error.status ?? "error"}`;
        } else {
          reason = "upstream_error";
        }
        // If generation may have billed, settle at the reservation so the
        // daily cap stays honest. Clean pre-stream errors settle at zero.
        actualMicro = sawStreamEvent ? args.reservationMicro : 0;
        try {
          controller.enqueue(
            encodeSseBytes("error", {
              code: "upstream_error",
              message: ERROR_MESSAGES.upstream_error,
            }),
          );
        } catch {
          // The client is gone. Nothing to send.
        }
      } finally {
        clearTimeout(timer);
        args.requestSignal.removeEventListener("abort", onClientAbort);
        args.ctx.waitUntil(
          gate
            .endTurn({
              sessionId: args.sessionId,
              now: Date.now(),
              userText: args.message,
              assistantText,
              actualMicro,
            })
            .catch(() => undefined),
        );
        console.log(
          JSON.stringify({
            evt: "agent_turn",
            day: utcDay(Date.now()),
            model: args.model,
            stop: stopReason,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cost_microusd: actualMicro,
            reason,
          }),
        );
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect.
        }
      }
    },
    cancel() {
      abortUpstream?.();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
  });
}

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const guard = postGuard(request, env);
  if ("response" in guard) return guard.response;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const sessionId = body.value.sessionId;
  if (!isValidSessionId(sessionId)) return jsonError("session_expired");
  const normalized = normalizeMessage(body.value.message);
  if (!normalized.ok) return jsonError(normalized.code, normalized.message);
  if (!(await rateLimitOk(env.RL_CHAT, guard.ip))) {
    return jsonError("rate_limited", undefined, 60);
  }
  if (env.ANTHROPIC_API_KEY === undefined || env.ANTHROPIC_API_KEY === "") {
    return jsonError("resting");
  }
  let knowledge: { text: string; paths: string[] };
  try {
    knowledge = await loadKnowledge(env);
  } catch {
    return jsonError("upstream_error");
  }
  const model = resolveModel(env.MODEL);
  const systemText = buildSystemBlock(knowledge.text)[0]?.text ?? knowledge.text;
  const reservationMicro = worstCaseMicroUsd(
    model,
    estimateTokens(systemText) + 1500,
    MAX_TOKENS,
  );
  const began = await gateStub(env).beginTurn({
    sessionId,
    ip: guard.ip,
    now: Date.now(),
    enabled: isEnabled(env),
    dailyMessageCap: parseDailyMessageCap(env.DAILY_MESSAGE_CAP),
    dailySpendCapMicro: parseDailySpendCapMicro(env.DAILY_SPEND_CAP_USD),
    reservationMicro,
  });
  if (!began.ok) return jsonError(began.code, undefined, began.retryAfter);
  return streamChat({
    env,
    ctx,
    requestSignal: request.signal,
    sessionId,
    message: normalized.message,
    history: began.history,
    remaining: began.remaining,
    model,
    knowledge: knowledge.text,
    paths: knowledge.paths,
    reservationMicro,
  });
}

function methodNotAllowed(allow: string): Response {
  const response = jsonError("bad_request", "Method not allowed.");
  const headers = new Headers(response.headers);
  headers.set("Allow", allow);
  return new Response(response.body, { status: 405, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/agent-context.txt") {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("X-Robots-Tag", "noindex");
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    if (path === "/api/agent/status") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const enabled =
        isEnabled(env) &&
        env.ANTHROPIC_API_KEY !== undefined &&
        env.ANTHROPIC_API_KEY !== "" &&
        env.TURNSTILE_SECRET !== undefined &&
        env.TURNSTILE_SECRET !== "";
      return jsonOk({ enabled, model: resolveModel(env.MODEL) }, "public, max-age=60");
    }
    if (path === "/api/agent/session") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleSession(request, env);
    }
    if (path === "/api/agent/chat") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleChat(request, env, ctx);
    }
    return new Response(JSON.stringify({ error: { code: "bad_request", message: "Not found." } }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
