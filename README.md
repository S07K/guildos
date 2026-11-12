# GuildOS

A Next.js App Router + TypeScript design studio where specialist AI agents design screens on a shared canvas. The marketing site uses Tailwind CSS; the studio uses MUI with its Next.js App Router cache integration and a shared theme. Node.js **24+** is required.

## Run locally

```sh
npm ci
npm run dev
```

The studio needs Supabase, an auth configuration and a vault secret; follow the [studio setup guide](docs/studio-setup.md). `npm run dev` applies pending migrations to `SUPABASE_DB_URL` and starts the agent worker alongside the web app.

```sh
npm test
npm run typecheck
npm run build
```

## Deploy

Production pushes run database migrations before publishing to Vercel. Configure the GitHub secrets and reconcile any manually applied SQL using the [production deployment guide](docs/deployment.md). Direct Vercel Git deployments from `main` are disabled so they cannot bypass this ordering.

## Scope

The public site presents the product and links to the studio. The studio adds email-code authentication, isolated workspaces, encrypted provider keys (BYOK), agent generation and revisions, version history, previews and HTML export. Specialist agents leave project-scoped review notes that can mention another role; user comments and earlier discussion are read on the next run. Shared vector memory, multi-user collaboration and Figma export remain future work. See `docs/design-references.md` for the visual direction and `docs/section-pipeline-redesign.md` for the section-based generation redesign in progress.

## Studio editing

The dashboard manages projects, model connections, and usage. Opening a project launches a dedicated canvas workspace with collapsible layer and design panels, a bottom tool dock, AI revisions, version history, zoom, and canvas panning. You can begin with a blank canvas and draw, edit, move, resize, duplicate, and save layers without connecting a model.

Generate a draft, select a section in **Layers**, and edit its copy in **Design**. **Page settings** provides typography and palette presets. Changes update the preview immediately. **Save changes** creates an immutable manual version with zero model tokens; it uses the existing studio migration and needs no additional Supabase setup. Undo and redo are available before saving. AI revisions save pending manual changes before sending the selected version and feedback to the provider.

Generated landing pages use a structured editing schema. Blank canvas projects support manual vector shapes and text with freeform positioning. Arbitrary CSS, asset import, and Figma export remain outside this editor's current scope.

## Browser checks

```sh
npx playwright install chromium
npm run build
npm run test:studio
```

Studio browser tests run against a localhost Supabase fixture; see [studio setup](docs/studio-setup.md#verification). If using an existing Chromium install, set `PLAYWRIGHT_EXECUTABLE_PATH` to its binary.

Run `npm run verify` for tests, build, the full dependency audit and studio browser checks. `npm run audit:production` isolates runtime findings. `.github/workflows/checks.yml` runs the same checks and independent full/production audits on push and pull requests.
