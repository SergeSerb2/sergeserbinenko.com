import { getCollection } from "astro:content";
import { site } from "../data/site.ts";
import { experience } from "../data/resume.ts";

export async function GET(): Promise<Response> {
  const allProjects = await getCollection("projects");
  const projects = allProjects
    .filter((p) => !p.data.draft)
    .sort((a, b) => a.data.order - b.data.order);
  const lines: string[] = [
    "# Serge Serbinenko",
    "",
    `> ${site.description}`,
    "",
    `${site.name} is a ${site.role.toLowerCase()} based in ${site.location}. Email: ${site.email}. GitHub: ${site.github}.${site.linkedin ? ` LinkedIn: ${site.linkedin}.` : ""}`,
    "",
    "## Projects",
    "",
    `- [All projects](${site.url}/projects): Every project on one page.`,
    ...projects.map((p) => `- [${p.data.title}](${site.url}/projects/${p.id}): ${p.data.tagline}`),
    "",
    "## Résumé",
    "",
    `- [Résumé](${site.url}/resume): Work history, projects, skills, education, and languages.`,
    ...experience.map((r) => `- ${r.title}, ${r.org} (${r.start}–${r.end})`),
    "",
  ];

  lines.push(
    "## Contact",
    "",
    `- [Contact](${site.url}/contact): Say hello.`,
    `- Email: ${site.email}`,
    `- GitHub: ${site.github}`,
    ...(site.linkedin ? [`- LinkedIn: ${site.linkedin}`] : []),
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
