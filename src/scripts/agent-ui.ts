/**
 * The site agent, as a conversation inside the About pane. The About
 * composer (`form[data-agent]`) chats through agent-client.ts; every other
 * composer keeps the mailto behavior in app.ts. Listeners bind once and
 * delegate, and the DOM is looked up fresh on each use because ClientRouter
 * swaps the pane on every navigation. Visitor and model text only ever
 * enter the page through textContent.
 */
import { navigate } from "astro:transitions/client";
import { getStatus, loadTurnstile, send, startSession } from "./agent-client.ts";
import type { AgentStatus, SseEvent } from "./agent-client.ts";
import {
  MAX_MESSAGE_CHARS,
  RESTING_NOTE_TEXT,
  appendTranscript,
  counterState,
  draftClipboardText,
  errorText,
  errorWantsEmailLink,
  isNavigablePath,
  mailtoHref,
  noteSegments,
  parseAction,
  parseNote,
  parseStoredSession,
  parseTranscript,
  resolveSiteKey,
  serializeNote,
  serializeSession,
  serializeTranscript,
  titleForPath,
  toFailure,
} from "./agent-ui-model.ts";
import type { AgentFailure, ChatNote, PathTitle, TranscriptAction, TranscriptEntry } from "./agent-ui-model.ts";
import { initTypewriter, stopTypewriter } from "./motion.ts";
import { site } from "../data/site.ts";

export interface AgentUiDeps {
  /** Enter peek mode: hide the window and show the scenery. */
  peek(): void;
  /** Show the titlebar toast with this text. */
  toast(text: string): void;
}

const SESSION_KEY = "agent.session";
const TRANSCRIPT_KEY = "agent.transcript";
const NOTE_KEY = "agent.note";
const FOLLOW_UP_PLACEHOLDER = "Ask a follow-up…";
const NEAR_BOTTOM_PX = 96;
const OPEN_PAGE_DELAY_MS = 900;
const SCENERY_DELAY_MS = 700;
const SENDING_PULSE_MS = 520;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Storage (sessionStorage can throw when storage is blocked) ---------- */
function readStore(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the chat still works, it just won't survive navigation */
  }
}
function clearStore(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
function loadTranscript(): TranscriptEntry[] {
  return parseTranscript(readStore(TRANSCRIPT_KEY));
}
function remember(entry: TranscriptEntry): void {
  writeStore(TRANSCRIPT_KEY, serializeTranscript(appendTranscript(loadTranscript(), entry)));
}

/* ---------- DOM ---------- */
interface ChatDom {
  form: HTMLFormElement;
  area: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  count: HTMLElement | null;
  about: HTMLElement;
  chat: HTMLElement;
  log: HTMLOListElement;
  note: HTMLElement;
  scroller: HTMLElement;
}

function chatDom(): ChatDom | null {
  const form = document.querySelector<HTMLFormElement>("form[data-agent]");
  const area = form?.querySelector<HTMLTextAreaElement>("[data-ask]");
  const sendButton = form?.querySelector<HTMLButtonElement>(".send");
  const about = form?.closest<HTMLElement>(".about");
  const chat = about?.querySelector<HTMLElement>(".chat");
  const log = chat?.querySelector<HTMLOListElement>(".chat__log");
  const note = about?.querySelector<HTMLElement>(".chat__note");
  const scroller = form?.closest<HTMLElement>(".view") ?? document.getElementById("main");
  if (!form || !area || !sendButton || !about || !chat || !log || !note || !scroller) return null;
  const count = form.querySelector<HTMLElement>(".composer__count");
  return { form, area, sendButton, count, about, chat, log, note, scroller };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isChatting(d: ChatDom): boolean {
  return d.about.classList.contains("is-chatting");
}

function isNearBottom(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX;
}

// Instant on purpose: messages animate in by themselves, and a smooth
// scroll would make the "near the bottom" check lie while streaming.
function scrollToEnd(scroller: HTMLElement): void {
  scroller.scrollTop = scroller.scrollHeight;
}

function announce(text: string): void {
  const live = document.getElementById("agentLive");
  if (live) live.textContent = text;
}

function withViewTransition(update: () => void): void {
  if (reducedMotion() || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  try {
    const transition = document.startViewTransition(update);
    // A skipped transition rejects these; the DOM update still runs.
    transition.ready.catch(() => undefined);
    transition.updateCallbackDone.catch(() => undefined);
    transition.finished.catch(() => undefined);
  } catch {
    update();
  }
}

/** Jump CSS animations to their end (restored messages appear at once). */
function settle(elements: Element[]): void {
  for (const element of elements) {
    for (const animation of element.getAnimations({ subtree: true })) {
      try {
        animation.finish();
      } catch {
        /* infinite animations cannot finish; none are expected here */
      }
    }
  }
}

/** Drop the restored marker before new messages arrive, without replaying old entrances. */
function endRestored(log: HTMLElement): void {
  if (!log.classList.contains("is-restored")) return;
  log.classList.remove("is-restored");
  settle(Array.from(log.children));
}

function sidebarRows(): PathTitle[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("#nav a.row[data-thread]")).map((row) => ({
    path: new URL(row.href, location.href).pathname,
    title: row.querySelector(".t")?.textContent?.trim() || "",
  }));
}

/* ---------- Messages ---------- */
function userMessage(text: string): HTMLLIElement {
  const li = el("li", "msg msg--user");
  li.append(el("div", "msg__body", text));
  return li;
}

function agentMessage(): { li: HTMLLIElement; body: HTMLDivElement } {
  const li = el("li", "msg msg--agent");
  const avatar = el("img", "msg__avatar");
  avatar.src = "/favicon.svg";
  avatar.alt = "";
  const body = el("div", "msg__body");
  li.append(avatar, body);
  return { li, body };
}

function typingIndicator(): HTMLDivElement {
  const dots = el("div", "msg__typing");
  dots.setAttribute("role", "status");
  dots.setAttribute("aria-label", "The agent is typing");
  dots.append(el("i"), el("i"), el("i"));
  return dots;
}

function actionLabel(action: TranscriptAction): string {
  switch (action.type) {
    case "open_page":
      return `Opening ${titleForPath(action.path, sidebarRows())}…`;
    case "show_scenery":
      return "Showing the scenery…";
    case "draft_email":
      return `Drafted an email: ${action.subject}`;
  }
}

async function copyDraft(subject: string, body: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(draftClipboardText(subject, body));
    deps?.toast("Draft copied");
  } catch {
    deps?.toast("Copy failed");
  }
}

function mailcard(subject: string, body: string): HTMLDivElement {
  const card = el("div", "mailcard");
  const head = el("div", "mailcard__head");
  head.append(el("span", undefined, "Draft email"), el("span", undefined, `to ${site.email}`));
  const actions = el("div", "mailcard__actions");
  const open = el("a", "btn", "Open in Mail");
  open.href = mailtoHref(site.email, subject, body);
  const copy = el("button", "btn ghost", "Copy");
  copy.type = "button";
  copy.addEventListener("click", () => void copyDraft(subject, body));
  actions.append(open, copy);
  card.append(head, el("div", "mailcard__subject", subject), el("div", "mailcard__body", body), actions);
  return card;
}

function actionElement(action: TranscriptAction): HTMLElement {
  return action.type === "draft_email" ? mailcard(action.subject, action.body) : el("span", "msg__action", actionLabel(action));
}

function errorNodes(failure: AgentFailure): HTMLElement[] {
  const nodes: HTMLElement[] = [el("p", "chat__error", errorText(failure))];
  if (errorWantsEmailLink(failure.code)) {
    const link = el("a", "btn ghost", "Email Serge");
    link.href = `mailto:${site.email}`;
    nodes.push(link);
  }
  return nodes;
}

function entryElement(entry: TranscriptEntry): HTMLLIElement {
  if (entry.role === "user") return userMessage(entry.text);
  const { li, body } = agentMessage();
  if (entry.text !== "") body.append(el("p", "msg__text", entry.text));
  for (const action of entry.actions ?? []) body.append(actionElement(action));
  return li;
}

function renderEntries(d: ChatDom, entries: TranscriptEntry[]): void {
  d.log.classList.add("is-restored");
  const items = entries.map(entryElement);
  d.log.replaceChildren(...items);
  settle(items);
}

function renderNote(note: HTMLElement, data: ChatNote | null): void {
  if (data === null) {
    note.replaceChildren();
    note.hidden = true;
    return;
  }
  const segments = noteSegments(data);
  note.replaceChildren(segments.lead);
  if (segments.count !== null) note.append(el("b", undefined, segments.count), segments.tail);
  note.hidden = false;
}

/* ---------- Status, Turnstile, session ---------- */
let deps: AgentUiDeps | null = null;
/** undefined: not asked yet; null: the status call failed. */
let knownStatus: AgentStatus | null | undefined;
let statusPromise: Promise<AgentStatus | null> | null = null;
let tokenSource: Promise<() => Promise<string>> | null = null;

function isResting(): boolean {
  return knownStatus === null || (knownStatus !== undefined && !knownStatus.enabled);
}

function currentModel(): string | null {
  return knownStatus?.model ?? parseNote(readStore(NOTE_KEY))?.model ?? null;
}

function turnstile(): Promise<() => Promise<string>> {
  if (tokenSource === null) {
    const configured = chatDom()?.form.dataset.sitekey ?? site.turnstileSiteKey;
    tokenSource = loadTurnstile(resolveSiteKey(location.hostname, configured));
    // Failures surface where the token is needed; keep the console clean.
    tokenSource.catch(() => undefined);
  }
  return tokenSource;
}

/** Ask for status once and start loading Turnstile. Safe to call often. */
function warm(): Promise<AgentStatus | null> {
  if (statusPromise === null) {
    statusPromise = getStatus()
      .catch(() => null)
      .then((status) => {
        knownStatus = status;
        const d = chatDom();
        if (d) applyStatus(d);
        return status;
      });
  }
  void turnstile();
  return statusPromise;
}

/** Resting: the About composer falls back to mail, and says so. */
function applyStatus(d: ChatDom): void {
  if (knownStatus === undefined || isChatting(d)) return;
  const resting = isResting();
  d.note.textContent = resting ? RESTING_NOTE_TEXT : "";
  d.note.hidden = !resting;
  d.sendButton.setAttribute("aria-label", resting ? "Send as an email" : "Send message");
  if (resting) d.area.removeAttribute("maxlength");
  else d.area.maxLength = MAX_MESSAGE_CHARS;
  updateCounter(d);
}

function updateCounter(d: ChatDom): void {
  const state = counterState(d.area.value.length);
  const active = !isResting();
  if (d.count) {
    // Empty while hidden: an invisible "0/280" would still squeeze the chips.
    d.count.textContent = active && state.visible ? state.text : "";
    d.count.classList.toggle("is-visible", active && state.visible);
    d.count.classList.toggle("is-over", active && state.over);
  }
  d.sendButton.disabled = active && state.over;
}

function failure(code: string): Error & AgentFailure {
  return Object.assign(new Error(code), { code });
}

async function ensureSession(signal: AbortSignal): Promise<string> {
  const stored = parseStoredSession(readStore(SESSION_KEY), Date.now());
  if (stored !== null) return stored.id;
  let token: string;
  try {
    const getToken = await turnstile();
    token = await getToken();
  } catch {
    tokenSource = null; // let the next attempt load the bot check again
    throw failure("bot_check_failed");
  }
  if (signal.aborted) throw failure("aborted");
  const session = await startSession(token, { signal });
  writeStore(SESSION_KEY, serializeSession({ id: session.sessionId, expiresAt: session.expiresAt }));
  return session.sessionId;
}

/* ---------- Turns ---------- */
interface Turn {
  epoch: number;
  dom: ChatDom;
  body: HTMLElement;
  typing: HTMLElement | null;
  textEl: HTMLParagraphElement | null;
  text: string;
  actions: TranscriptAction[];
  done: boolean;
  remaining: number | null;
  failure: AgentFailure | null;
  signal: AbortSignal;
}

/** Bumped by "New chat"; a turn from an older epoch must not touch anything. */
let chatEpoch = 0;
let busy = false;
let abortTurn: AbortController | null = null;

const stale = (turn: Turn) => turn.epoch !== chatEpoch;

function clearTyping(turn: Turn): void {
  turn.typing?.remove();
  turn.typing = null;
}

function onEvent(turn: Turn, event: SseEvent): void {
  if (stale(turn)) return;
  const data = (typeof event.data === "object" && event.data !== null ? event.data : {}) as Record<string, unknown>;
  if (event.type === "text") {
    const delta = typeof data.delta === "string" ? data.delta : "";
    if (delta === "") return;
    const follow = isNearBottom(turn.dom.scroller);
    if (turn.textEl === null) {
      turn.textEl = el("p", "msg__text is-streaming");
      if (turn.typing) turn.typing.replaceWith(turn.textEl);
      else turn.body.prepend(turn.textEl);
      turn.typing = null;
    }
    turn.textEl.append(el("span", undefined, delta));
    turn.text += delta;
    if (follow) scrollToEnd(turn.dom.scroller);
  } else if (event.type === "action") {
    const action = parseAction(event.data);
    if (action === null) return;
    const follow = isNearBottom(turn.dom.scroller);
    clearTyping(turn);
    turn.actions.push(action);
    turn.body.append(actionElement(action));
    if (follow) scrollToEnd(turn.dom.scroller);
  } else if (event.type === "done") {
    turn.done = true;
    turn.remaining = typeof data.remaining === "number" ? data.remaining : null;
  } else if (event.type === "error") {
    turn.failure = toFailure(event.data);
  }
}

function runEffects(turn: Turn): void {
  const stillHere = () => !stale(turn) && turn.dom.log.isConnected;
  for (const action of turn.actions) {
    if (action.type === "open_page") {
      const path = action.path;
      if (!isNavigablePath(path, sidebarRows()) || location.pathname === path) continue;
      window.setTimeout(() => {
        if (stillHere()) void navigate(path);
      }, OPEN_PAGE_DELAY_MS);
    } else if (action.type === "show_scenery") {
      window.setTimeout(() => {
        if (stillHere()) deps?.peek();
      }, SCENERY_DELAY_MS);
    }
  }
}

function finishTurn(turn: Turn): void {
  const d = turn.dom;
  const follow = isNearBottom(d.scroller);
  clearTyping(turn);
  turn.textEl?.classList.remove("is-streaming");
  const answered = turn.text !== "" || turn.actions.length > 0;
  if (answered) {
    remember(turn.actions.length > 0 ? { role: "agent", text: turn.text, actions: turn.actions } : { role: "agent", text: turn.text });
  }
  const problem = turn.failure ?? (answered ? null : ({ code: "upstream_error" } satisfies AgentFailure));
  if (problem !== null) {
    turn.body.append(...errorNodes(problem));
    announce(errorText(problem));
  } else {
    const model = currentModel();
    if (model !== null) {
      const note: ChatNote = { model, remaining: turn.remaining };
      writeStore(NOTE_KEY, serializeNote(note));
      renderNote(d.note, note);
    }
    announce([turn.text, ...turn.actions.map(actionLabel)].filter((part) => part !== "").join(" "));
    runEffects(turn);
  }
  if (follow) scrollToEnd(d.scroller);

  // The visitor left and came back mid-answer: show the saved transcript.
  if (!d.log.isConnected) {
    const current = chatDom();
    if (current && isChatting(current)) {
      renderEntries(current, loadTranscript());
      renderNote(current.note, parseNote(readStore(NOTE_KEY)));
      scrollToEnd(current.scroller);
    }
  }
}

async function runTurn(turn: Turn, message: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    turn.failure = null;
    try {
      const sessionId = await ensureSession(turn.signal);
      if (stale(turn)) return;
      await send(sessionId, message, (event) => onEvent(turn, event), { signal: turn.signal });
    } catch (error) {
      if (stale(turn)) return;
      if (!turn.done) turn.failure = toFailure(error);
    }
    if (stale(turn)) return;
    // An expired session gets one fresh session and one retry.
    if (turn.failure?.code === "session_expired" && attempt === 0 && turn.text === "") {
      clearStore(SESSION_KEY);
      continue;
    }
    break;
  }
  if (turn.failure === null && !turn.done) turn.failure = { code: "upstream_error" };
  finishTurn(turn);
}

// The stylesheet gives .chat display:flex, which overrides [hidden], so the
// markup also carries an inline display:none that is toggled with it.
function showChat(d: ChatDom, shown: boolean): void {
  d.chat.hidden = !shown;
  d.chat.style.display = shown ? "" : "none";
}

function enterChat(d: ChatDom): void {
  d.about.classList.add("is-chatting");
  showChat(d, true);
  stopTypewriter();
  d.area.placeholder = FOLLOW_UP_PLACEHOLDER;
}

function leaveChat(d: ChatDom): void {
  d.about.classList.remove("is-chatting");
  showChat(d, false);
}

/**
 * Submit handler for the About composer. Falls back to `fallback` (mail)
 * when the agent is resting and no chat is under way.
 */
export async function submitToAgent(form: HTMLFormElement, fallback: (form: HTMLFormElement) => void): Promise<void> {
  const d = chatDom();
  if (d === null || d.form !== form) {
    fallback(form);
    return;
  }
  if (busy) return;
  const message = d.area.value.trim();
  if (message === "") return;

  busy = true;
  const status = await warm();
  busy = false;
  if (!d.form.isConnected) return;
  if (!status?.enabled && !isChatting(d)) {
    fallback(form);
    return;
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    updateCounter(d);
    return;
  }

  const epoch = chatEpoch;
  const controller = new AbortController();
  abortTurn = controller;
  busy = true;
  d.form.classList.add("is-busy");
  d.form.classList.add("is-sending");
  window.setTimeout(() => d.form.classList.remove("is-sending"), SENDING_PULSE_MS);
  d.area.value = "";
  updateCounter(d);

  const { li, body } = agentMessage();
  const typing = typingIndicator();
  body.append(typing);
  const userLi = userMessage(message);
  remember({ role: "user", text: message });

  const place = () => {
    endRestored(d.log);
    d.log.append(userLi, li);
    scrollToEnd(d.scroller);
  };
  if (isChatting(d)) {
    place();
  } else {
    const model = currentModel();
    withViewTransition(() => {
      enterChat(d);
      renderNote(d.note, model === null ? null : { model, remaining: null });
      place();
    });
  }

  const turn: Turn = {
    epoch,
    dom: d,
    body,
    typing,
    textEl: null,
    text: "",
    actions: [],
    done: false,
    remaining: null,
    failure: null,
    signal: controller.signal,
  };
  try {
    await runTurn(turn, message);
  } finally {
    if (!stale(turn)) {
      busy = false;
      abortTurn = null;
      d.form.classList.remove("is-busy");
      chatDom()?.form.classList.remove("is-busy");
    }
  }
}

/** "New chat": forget everything and bring the hero back. */
function resetChat(): void {
  const d = chatDom();
  if (d === null) return;
  chatEpoch += 1;
  abortTurn?.abort();
  abortTurn = null;
  busy = false;
  clearStore(TRANSCRIPT_KEY);
  clearStore(SESSION_KEY);
  clearStore(NOTE_KEY);
  withViewTransition(() => {
    d.log.replaceChildren();
    d.log.classList.remove("is-restored");
    d.form.classList.remove("is-busy");
    leaveChat(d);
    renderNote(d.note, null);
    applyStatus(d);
    updateCounter(d);
    initTypewriter();
    d.area.focus();
  });
}

/** Restore a saved conversation instantly. No-op when already chatting. */
function restoreChat(d: ChatDom): void {
  if (isChatting(d)) return;
  const entries = loadTranscript();
  if (entries.length === 0) return;
  enterChat(d);
  renderEntries(d, entries);
  const stored = parseNote(readStore(NOTE_KEY));
  const model = currentModel();
  renderNote(d.note, stored ?? (model === null ? null : { model, remaining: null }));
  if (busy) d.form.classList.add("is-busy");
  scrollToEnd(d.scroller);
}

/** Per page: restore the chat, pin the placeholder, refresh status-driven bits. */
export function onAgentPageLoad(): void {
  const d = chatDom();
  if (d === null) return;
  // A failed status call gets another try on the next About visit.
  if (knownStatus === null) statusPromise = null;
  restoreChat(d);
  if (isChatting(d)) {
    stopTypewriter();
    d.area.placeholder = FOLLOW_UP_PLACEHOLDER;
    requestAnimationFrame(() => scrollToEnd(d.scroller));
  } else {
    applyStatus(d);
  }
  updateCounter(d);
}

let agentInit = false;
export function initAgent(options: AgentUiDeps): void {
  if (agentInit) return;
  agentInit = true;
  deps = options;

  const inAgentComposer = (target: EventTarget | null) =>
    target instanceof Element && target.closest("form[data-agent]") !== null;

  document.addEventListener("focusin", (e) => {
    if (inAgentComposer(e.target)) void warm();
  });
  document.addEventListener(
    "pointerover",
    (e) => {
      if (inAgentComposer(e.target)) void warm();
    },
    { passive: true },
  );
  document.addEventListener("input", (e) => {
    if (!(e.target instanceof HTMLTextAreaElement) || !inAgentComposer(e.target)) return;
    const d = chatDom();
    if (d) updateCounter(d);
  });
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest(".chat__reset")) resetChat();
  });
  // Restore before the new pane is captured, so navigation never flashes the hero.
  document.addEventListener("astro:after-swap", () => {
    const d = chatDom();
    if (d) restoreChat(d);
  });
}
