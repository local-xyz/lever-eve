# Vercel Services Connection Design

## Goal

Configure the existing `palette-labs-inc/lever` Vercel project as a complete
OpenInstinct deployment using Eve, Kernel, Linq, Neon, and private Vercel Blob.

## Architecture

The repository is linked to the existing Vercel project through Eve. Kernel is
provisioned from Vercel Marketplace, Neon supplies Postgres, and a private Blob
store holds installation secrets, memory, and browser images. A new managed Linq
line is attached to Production, Preview, and Development, with inbound events
forwarded to `/eve/v1/linq`. Vercel AI Gateway uses project OIDC.

## Provisioning

1. Run the project CLI under Node.js 24.
2. Link Eve to `lever` in the `palette-labs-inc` team.
3. Provision Kernel, Neon, and private Blob resources and connect all three
   Vercel environments.
4. Create a managed Linq line, attach it to all three environments with inbound
   triggers, and expose its connector UID as `LINQ_CONNECTOR`.
5. Pull project environment metadata, deploy through Eve, and verify the health
   endpoint and project resources.
6. Complete Linq's one-time phone-number verification if its dashboard requires
   user interaction.

## Safety and verification

Secret values must never be printed or committed. Existing repository files are
not changed by provisioning except for Vercel's ignored local link metadata.
Verification checks resource attachment, environment-variable names, deployment
status, and the deployed Eve health route.
