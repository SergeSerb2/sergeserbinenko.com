import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { scenes } from "./data/scenes.ts";

const sceneKey = z
  .string()
  .refine((v) => v in scenes, {
    message: "scene must be a key of scenes in src/data/scenes.ts",
  });

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        tagline: z.string(),
        year: z.string(),
        kind: z.enum(["product", "open-source", "fork", "work", "experiment"]),
        role: z.string().optional(),
        status: z.string().optional(),
        stack: z.array(z.string()),
        scene: sceneKey,
        featured: z.boolean().default(false),
        order: z.number().default(100),
        links: z
          .object({
            repo: z.url().optional(),
            live: z.url().optional(),
            download: z.url().optional(),
          })
          .default({}),
        shot: image().optional(),
        shotAlt: z.string().optional(),
        draft: z.boolean().default(false),
      })
      .refine((d) => !d.shot || Boolean(d.shotAlt), {
        message: "shotAlt is required when shot is set",
        path: ["shotAlt"],
      }),
});

export const collections = { projects };
