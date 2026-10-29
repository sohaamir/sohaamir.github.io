# Staging deploy and cutover runbook

Nothing here has been run. Every outward-facing step needs Aamir's explicit go-ahead.

Facts checked against the old repo (`sohaamir.github.io`, read-only):

- Default branch is `master`. Pages is served from the `gh-pages` branch, built by al-folio's workflow.
- `CNAME` exists at the repo root and contains `sohamir.org`.
- al-folio workflows in `.github/workflows/`: `deploy.yml`, `deploy-image.yml`, `deploy-docker-tag.yml`, `docker-slim.yml`, `jekyll.yml`.
- No `al-folio-archive` branch and no `al-folio-final` tag exist yet.

CI (`.github/workflows/deploy.yml`) runs `npm ci`, `npm test`, build, `check:links`, `check:budget`, then deploys. It does not run Playwright (browser download cost). Run `npm run test:e2e` locally before merging any PR.

## Part A. Staging (new_website repo)

Assumption: `sohamir.org` is the custom domain of the user site `sohaamir.github.io`, so a project repo under the same account is served at `https://sohamir.org/new_website/`. If it is not (it would then be `https://sohaamir.github.io/new_website/`), substitute that host in the checks below.

1. Run `npm test`, `npm run build`, `npm run check:links`, `npm run check:budget` and `npm run test:e2e` locally on `feat/living-room-site`.
2. Create the public repo `sohaamir/new_website` (empty, no README) and add it as `origin`.
3. Push `main` (the initial commit), then push `feat/living-room-site`.
4. Open a PR `feat/living-room-site` -> `main` and merge it (never commit to `main` directly).
5. Repo Settings -> Secrets and variables -> Actions -> Variables: add `SITE_BASE` = `/new_website/` (leading and trailing slash, which is what `astro.config.mjs` and `withBase()` expect; unset means `/`).
6. Settings -> Pages -> Source: "GitHub Actions". Re-run the `deploy` workflow (`workflow_dispatch`) if the merge ran before steps 5 and 6.
7. Verify (all should print 200):

```bash
B=https://sohamir.org/new_website
for p in / "/?tv=1" /about/ /publications/ /projects/ /cv/ /journey/ /blog/ /models/brain.glb /assets/pdf/academic_cv.pdf; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")" "$p"
done
curl -sI "$B/models/brain.glb" | head -1
```

Also open `$B/` and `$B/?tv=1` on a phone and click every channel to confirm links stay under `/new_website/`.

## Part B. Cutover (sohaamir.github.io)

Run only when Aamir says he is happy with the staging site.

1. Preserve the old site (in `sohaamir.github.io`):
   ```bash
   git switch master && git pull
   git branch al-folio-archive && git tag al-folio-final
   git push origin al-folio-archive al-folio-final
   ```
2. Create branch `feat/living-room-site` there and replace the tree with this repo's contents (everything except `.git`). Then:
   - Add `public/CNAME` containing `sohamir.org` (the old root `CNAME` goes away with the old tree).
   - Delete `.github/workflows/deploy.yml` (al-folio's), `deploy-image.yml`, `deploy-docker-tag.yml`, `docker-slim.yml`, `jekyll.yml`, and add this repo's `deploy.yml` (same filename, so replace it).
   - Do NOT set a `SITE_BASE` variable on this repo (the default `/` is correct). Remove it if present.
3. Open a PR into `master`. Aamir merges (no direct commits to `master`).
4. Settings -> Pages -> Source: "GitHub Actions". Check Settings -> Environments -> `github-pages` -> Deployment branches allows `master` (or all branches). The workflow triggers on push to `main` or `master`, so the merge normally deploys by itself. If the merge ran before Pages was switched, trigger it manually: Actions -> deploy -> Run workflow (`workflow_dispatch`) on `master`, or `gh workflow run deploy.yml --ref master`. Verify:
   - `https://sohamir.org/` loads the room, `/?tv=1` opens at the TV, all six channels load.
   - `https://sohamir.org/assets/pdf/academic_cv.pdf` returns 200.
   - The 10 old blog post URLs return 200 (the new site keeps the same slugs):
     ```bash
     for p in 2023/cinn_goodbye 2023/setting_up_website 2023/chatgpt_and_psychology 2024/psych_classification 2024/citation_forecasting 2024/stem_outreach 2024/a_memorable_summer 2024/create_mkdocs_website 2025/reproducibility_tools-copy 2025/millionaire; do
       printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://sohamir.org/blog/$p/")" "$p"
     done
     ```
   - Old non-post URLs (tags, categories, `/news/...`, `/gallery/`, `/projects/*`, etc.) redirect via `src/data/redirects.json`; spot-check e.g. `/blog/tag/python/` and `/news/`.
   - HTTPS still enforced and the custom domain still shows in Settings -> Pages.
   Only after all of this passes, delete the `gh-pages` branch.
5. Disable Pages on `sohaamir/new_website` (Settings -> Pages -> Unpublish) and archive or delete the repo.

No DNS change is needed: `sohamir.org` already points at GitHub Pages for `sohaamir.github.io`.

## Rollback

If anything is wrong after step 4 and `gh-pages` still exists:

1. Settings -> Pages -> Source: "Deploy from a branch", branch `gh-pages`, `/ (root)`. The old site is live again within minutes. Re-check the custom domain is still `sohamir.org`.

If `gh-pages` was already deleted (in `sohaamir.github.io`):

```bash
git switch -c rollback al-folio-final
git push origin rollback
```

Then: Settings -> Pages -> Source "GitHub Actions"; Settings -> Environments -> `github-pages` -> allow the `rollback` branch; run Actions -> `deploy` on `rollback` (the al-folio `deploy.yml` there rebuilds and republishes `gh-pages`); finally set Pages Source to "Deploy from a branch" -> `gh-pages` -> `/ (root)`.

The `al-folio-archive` branch and `al-folio-final` tag are never deleted.
