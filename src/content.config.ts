import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news' }),
  schema: z.object({ date: z.coerce.date() }),
});

// journey.yml is a YAML list of { id, image, caption }; ids must be unique.
const journey = defineCollection({
  loader: file('src/content/journey.yml'),
  schema: z.object({
    id: z.string(),
    image: z.string(), // filename inside public/assets/img/gallery/
    caption: z.string(), // Markdown (may contain links)
    year: z.number(), // groups the photos on the journey page
  }),
});

const profile = defineCollection({
  loader: file('src/content/profile.yml'),
  schema: z.object({
    name: z.string(),
    subtitle: z.string(),
    photo: z.string(),
    email: z.string(),
    socials: z.object({
      github: z.string(),
      bluesky: z.string(),
      x: z.string(),
      linkedin: z.string(),
      orcid: z.string(),
      researchgate: z.string(),
      osf: z.string(),
    }),
    education: z.array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        years: z.string(),
        logo: z.string(), // '' for no logo
      }),
    ),
    experience: z.array(z.object({ role: z.string(), place: z.string(), years: z.string() })),
  }),
});

// Single-file about page: one-entry glob collection, id "about".
const about = defineCollection({
  loader: glob({ pattern: 'about.md', base: './src/content' }),
  schema: z.object({ title: z.string() }),
});

export const collections = { blog, news, journey, profile, about };
