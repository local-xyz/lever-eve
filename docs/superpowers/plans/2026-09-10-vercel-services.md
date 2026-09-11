# Vercel Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect and deploy OpenInstinct on the existing `palette-labs-inc/lever` Vercel project.

**Architecture:** Eve owns project linking and deployment. Vercel Marketplace provisions Kernel and Neon, Vercel Blob stores private durable data, and Vercel Connect provides a managed Linq line with inbound events routed to Eve.

**Tech Stack:** Node.js 24, pnpm 11, Eve, Vercel CLI, Vercel Connect, Kernel, Neon, Vercel Blob

## Global Constraints

- Target `palette-labs-inc/lever`; do not create another Vercel project.
- Connect Production, Preview, and Development.
- Do not print, copy, or commit secret values.
- Route inbound Linq events to `/eve/v1/linq`.

---

### Task 1: Link the project

**Files:**

- Generated locally: `.vercel/project.json`

**Interfaces:**

- Produces: an Eve/Vercel project link for `palette-labs-inc/lever`

- [ ] Activate Node.js 24 with NVM.
- [ ] Run `pnpm exec eve link --project lever --team palette-labs-inc --non-interactive`.
- [ ] Inspect the generated project link and confirm the project ID matches Vercel.

### Task 2: Provision required resources

**Files:**

- No authored repository files

**Interfaces:**

- Consumes: linked `palette-labs-inc/lever` project
- Produces: attached Kernel, Neon, and private Blob resources

- [ ] Add the Kernel Marketplace integration to the linked project.
- [ ] Add the Neon Marketplace integration to the linked project.
- [ ] Create a private Blob store attached to Production, Preview, and Development.
- [ ] List environment-variable names and confirm Kernel, database, and Blob configuration without printing values.

### Task 3: Configure Linq

**Files:**

- No authored repository files

**Interfaces:**

- Consumes: linked `palette-labs-inc/lever` project
- Produces: managed Linq connector attached to all environments

- [ ] Create a managed Linq line named `lever`.
- [ ] Capture its connector UID from structured CLI output.
- [ ] Attach it to Production, Preview, and Development with triggers at `/eve/v1/linq`.
- [ ] Set `LINQ_CONNECTOR` in all three environments without echoing its value.
- [ ] Open the connector settings only if one-time phone verification is required.

### Task 4: Deploy and verify

**Files:**

- No authored repository files

**Interfaces:**

- Consumes: all linked resources and connector configuration
- Produces: production OpenInstinct deployment

- [ ] Run `pnpm exec eve deploy --project lever --team palette-labs-inc --non-interactive --yes`.
- [ ] Confirm the production deployment reaches Ready.
- [ ] Request `/eve/v1/health` and confirm a successful response.
- [ ] Confirm all expected resource and environment-variable names remain attached.
