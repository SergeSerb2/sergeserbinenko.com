// Build-time knowledge text for the site agent. The Worker loads this
// file from static assets and puts it in the cached system prompt.
// Site-map lines use the form `PAGE <path> | <title>`; the Worker reads
// the valid open_page paths from those lines.

import { getCollection } from "astro:content";
import { site } from "../data/site.ts";
import { education, experience, skills, volunteering } from "../data/resume.ts";

export interface AgentContext {
  text: string;
  paths: string[];
}

function isPublicSummary(summary: string): boolean {
  return !summary.startsWith("TODO(serge)");
}

/** Build the knowledge text and the list of valid site paths. */
export async function buildAgentContext(): Promise<AgentContext> {
  const allProjects = await getCollection("projects");
  const projects = allProjects
    .filter((project) => !project.data.draft)
    .sort((a, b) => a.data.order - b.data.order);

  const pages: Array<{ path: string; title: string }> = [
    { path: "/", title: "Home — Serge Serbinenko" },
    { path: "/projects", title: "Projects" },
    ...projects.map((project) => ({
      path: `/projects/${project.id}`,
      title: project.data.title,
    })),
    { path: "/resume", title: "Résumé" },
    { path: "/contact", title: "Contact" },
  ];

  const lines: string[] = [
    "SITE MAP (every page of sergeserbinenko.com)",
    ...pages.map((page) => `PAGE ${page.path} | ${page.title}`),
    "",
    "ABOUT SERGE",
    `Name: ${site.name}`,
    `Role: ${site.role}`,
    `Location: ${site.location} (${site.timeZone})`,
    `Languages: ${site.languages.join(", ")}`,
    `Email: ${site.email}`,
    `GitHub: ${site.github}`,
    ...(site.linkedin ? [`LinkedIn: ${site.linkedin}`] : []),
    `Summary: ${site.description}`,
    "",
    "RÉSUMÉ — EXPERIENCE",
  ];

  for (const role of experience) {
    lines.push(`${role.title} at ${role.org} (${role.start} – ${role.end})`);
    if (isPublicSummary(role.summary)) lines.push(`Summary: ${role.summary}`);
    for (const point of role.points) lines.push(`- ${point}`);
    if (role.stack && role.stack.length > 0) lines.push(`Stack: ${role.stack.join(", ")}`);
    lines.push("");
  }

  lines.push("RÉSUMÉ — EDUCATION");
  for (const entry of education) {
    lines.push(`${entry.degree}, ${entry.school} (${entry.start} – ${entry.end})`);
  }
  lines.push("", "RÉSUMÉ — SKILLS");
  for (const [group, items] of Object.entries(skills)) {
    lines.push(`${group}: ${items.join(", ")}`);
  }
  lines.push("", "RÉSUMÉ — VOLUNTEERING");
  for (const entry of volunteering) {
    lines.push(`${entry.title} at ${entry.org} (${entry.start} – ${entry.end}): ${entry.summary}`);
  }
  lines.push("", "PROJECTS");

  for (const project of projects) {
    const data = project.data;
    lines.push(
      `PROJECT: ${data.title}`,
      `Path: /projects/${project.id}`,
      `Kind: ${data.kind}`,
      `Year: ${data.year}`,
    );
    if (data.status) lines.push(`Status: ${data.status}`);
    if (data.role) lines.push(`Serge's role: ${data.role}`);
    lines.push(`Stack: ${data.stack.join(", ")}`, `Tagline: ${data.tagline}`);
    if (data.links.repo) lines.push(`Repo: ${data.links.repo}`);
    if (data.links.live) lines.push(`Live: ${data.links.live}`);
    if (data.links.download) lines.push(`Download: ${data.links.download}`);
    const body = (project.body ?? "").trim();
    if (body.length > 0) lines.push("Full text:", body);
    lines.push("");
  }

  lines.push(
    "HOW THIS WEBSITE WORKS",
    "This site is a static Astro site on Cloudflare. A scenery photo sits behind every page, " +
      "and each project has its own scene. The site agent (you) answers from this knowledge text only.",
    `To contact Serge, visitors can email ${site.email} or use the /contact page.`,
    "",
  );

  return { text: lines.join("\n"), paths: pages.map((page) => page.path) };
}

export async function GET(): Promise<Response> {
  const { text } = await buildAgentContext();
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
