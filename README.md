# sohamir.org

Living-room 3D personal website for Aamir Sohail. The previous al-folio site is kept on the `al-folio-archive` branch and the `al-folio-final` tag.

## Run locally

```bash
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # static build into dist/
npm run preview    # serve dist/ locally
```

Tests: `npm test` (Vitest unit) and `npm run test:e2e` (Playwright, builds and previews the site). Set `SITE_BASE=/new_website/` to build for staging.

The TV-on sound is synthesized in code with the Web Audio API (`src/scene/sound.ts`); there is no third-party audio asset.

## Adding content

None of these touch code. Schemas live in `src/content.config.ts`; a bad entry fails `npm run build`.

**Paper.** Add a BibTeX entry to `src/data/papers.bib`. Put the PDF in `public/assets/pdf/` and an optional preview image in `public/assets/img/publication_preview/`:

```bibtex
@article{sohail2026example,
  title = {An example paper},
  author = {Sohail, Aamir and Zhang, Lei},
  journal = {Journal},
  year = {2026},
  pdf = {example_preprint.pdf},
  preview = {example_figure.png},
}
```

**Blog post.** Drop `src/content/blog/<slug>.md` (the URL is `/blog/<year of date>/<filename>/`; an optional `slug:` front-matter field overrides the filename):

```md
---
title: "My new post"
date: 2026-03-01
tags: ["neuroscience", "outreach"]
description: "Optional one-line summary."
---

Post body in Markdown. Images go in `public/assets/img/posts/<slug>/` and are linked as `/assets/img/posts/<slug>/pic.png`.
```

**Project.** Add `src/content/projects/<slug>.md`. `status` is `present` or `past`; `order` sorts within the page:

```md
---
title: "Project title"
short: "One-line summary."
status: present
order: 6
image: /assets/img/my_project.png
publications:
  - "Author, A. (2026). Title. *Journal*. [https://doi.org/xx](https://doi.org/xx)"
---

Project description in Markdown.
```

**News item.** Add `src/content/news/<anything>.md`; the body is the item:

```md
---
date: 2026-05-01
---

Excited to announce that [something](https://example.org) happened!
```

**Journey photo.** Put the image in `public/assets/img/gallery/` and add one entry to `src/content/journey.yml` (`id` must be unique, e.g. the filename without extension; captions may contain Markdown links):

```yaml
- id: my_photo
  image: my_photo.png
  caption: "At the [conference](https://example.org) (Jun 2026)"
```
