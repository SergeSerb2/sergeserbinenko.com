// Tool definitions sent to Claude, plus validation of tool input before
// the Worker relays an action to the browser. Invalid actions return null
// and the turn still finishes normally.

import type Anthropic from "@anthropic-ai/sdk";

export type AgentAction =
  | { type: "open_page"; path: string }
  | { type: "show_scenery" }
  | { type: "draft_email"; subject: string; body: string };

export const MAX_EMAIL_SUBJECT_CHARS = 80;
export const MAX_EMAIL_BODY_CHARS = 600;

const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set([
  "sergeserbinenko.com",
  "www.sergeserbinenko.com",
]);

/** Build the three client-action tools. Paths come from the knowledge text. */
export function buildTools(paths: string[]): Anthropic.Tool[] {
  const enumPaths = paths.length > 0 ? [...paths] : ["/"];
  return [
    {
      name: "open_page",
      description:
        "Open a page of this site for the visitor, e.g. when they ask to see a project or the résumé.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            enum: enumPaths,
            description: "The site path to open. Must be one of the listed paths.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "show_scenery",
      description:
        "Hide the window for a moment so the visitor can see the scenery photo behind it.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      name: "draft_email",
      description:
        "Prefill an email to Serge for the visitor to review and send themselves (nothing is sent automatically). Only when the visitor wants to contact Serge.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Email subject, at most 80 characters.",
          },
          body: {
            type: "string",
            description: "Email body, at most 600 characters. Plain text.",
          },
        },
        required: ["subject", "body"],
        additionalProperties: false,
      },
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when every URL or bare domain in the text points at
 * sergeserbinenko.com. Email addresses are not URLs, so they are
 * removed before scanning (a visitor may add a reply address).
 */
export function hasOnlyAllowedLinks(text: string): boolean {
  const withoutEmails = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ");
  // Bare domains count only with a common TLD, so names like "Node.js"
  // or "resume.pdf" in a draft do not look like links.
  const candidates =
    withoutEmails.match(
      /(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|dev|app|ai|xyz|info|biz|me|tv|cc|us|ca|site|online|top|live|pro|tech)\b/gi,
    ) ?? [];
  for (const candidate of candidates) {
    const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    let host: string;
    try {
      host = new URL(withScheme).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (!ALLOWED_LINK_HOSTS.has(host)) return false;
  }
  return true;
}

/** Validate one tool call from the model. Returns null to drop the action. */
/**
 * A short first-person note about an action, stored in history so a follow-up
 * like "tell me more about that page" still makes sense to the model.
 */
export function actionNote(action: { type: string; path?: string; subject?: string }): string {
  switch (action.type) {
    case "open_page":
      return `I opened ${action.path ?? "a page"} for you.`;
    case "show_scenery":
      return "I showed you the scenery behind the window.";
    case "draft_email":
      return `I drafted an email to Serge${action.subject ? ` titled "${action.subject}"` : ""} for you to send.`;
    default:
      return "";
  }
}

export function validateToolAction(
  name: string,
  input: unknown,
  allowedPaths: string[],
): AgentAction | null {
  if (name === "show_scenery") {
    return { type: "show_scenery" };
  }
  if (!isRecord(input)) return null;
  if (name === "open_page") {
    const path = input.path;
    if (typeof path !== "string") return null;
    return allowedPaths.includes(path) ? { type: "open_page", path } : null;
  }
  if (name === "draft_email") {
    const subject = input.subject;
    const body = input.body;
    if (typeof subject !== "string" || typeof body !== "string") return null;
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    if (cleanSubject.length === 0 || cleanSubject.length > MAX_EMAIL_SUBJECT_CHARS) return null;
    if (cleanBody.length === 0 || cleanBody.length > MAX_EMAIL_BODY_CHARS) return null;
    if (!hasOnlyAllowedLinks(cleanBody) || !hasOnlyAllowedLinks(cleanSubject)) return null;
    return { type: "draft_email", subject: cleanSubject, body: cleanBody };
  }
  return null;
}
