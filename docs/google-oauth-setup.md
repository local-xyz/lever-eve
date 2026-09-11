# Google OAuth for Lever

Lever uses Vercel Connect for Gmail, Calendar, and Contacts. OAuth client credentials are stored in a **Google connector in Vercel Connect**, not in application environment variables or in chat. Each Lever user then authorizes their own Google account.

## Existing Google client (September 10, 2026)

Reuse **Lever-vercel** in GCP project **lever-integrations-prod**. This is the existing client formerly named **Lever – Nango Production**, not a new OAuth application.

- Client ID: `486188410603-oas37c5f294ob9o54n7gc2879e14bnjl.apps.googleusercontent.com`
- Vercel callback: `https://connect.vercel.com/callback` (saved and verified).
- Existing Nango callback retained: `https://api.nango.dev/oauth/callback`.
- Gmail, Google Calendar, and People APIs enabled; the scopes below are registered alongside existing scopes.
- Consent screen name: **Lever**. Audience remains **External / Testing**, with `mike@palettelabs.io` as the existing test user.

Vercel connector **google/lever** (`scl_RPb8qu2giCPF6XLghoC5A`) was created with the supplied client secret and is attached to **lever** in Production, Preview, and Development. `GOOGLE_CONNECTOR_UID=google/lever` is configured for all three environments. The temporary credentials file was deleted immediately after creation. Vercel Connect successfully starts authorization; each user must still connect their Google account through Lever. Google token exchange and API access can only be verified after that consent flow finishes.

## 1. Configure the Google client

1. Open [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), select your project, and enable **Gmail API**, **Google Calendar API**, and **People API**.
2. Configure Google Auth Platform branding with the app name **Lever**, your support email, and your audience. During testing, add the Google accounts that will test the app as test users.
3. Use the existing **Lever-vercel** Web application client described above.
4. Open [Palette Labs → Vercel Connect → Create Google connector](https://vercel.com/palette-labs-inc/~/connect?create=google). Use the exact OAuth redirect URI shown by Vercel in the Google client's **Authorized redirect URIs**. This callback belongs to Vercel Connect; do not substitute Lever's Better Auth callback or its Linq webhook route.
5. Copy the client ID and client secret directly into the Google connector form. Name the connector **lever**. Do not paste the secret into chat or commit it to the repository.

Google's setup guide: https://developers.google.com/identity/protocols/oauth2/web-server
Vercel's Google connector guide: https://vercel.com/connect/google

## 2. Attach the connector to the application

Attach the connector to project **lever** in team **palette-labs-inc**, granting access in **Production, Preview, and Development**. In the project's Environment Variables, set:

```text
GOOGLE_CONNECTOR_UID=google/lever
```

Use the actual UID shown by Vercel if it differs. This is the only Google-specific environment variable the application reads. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are not read by this application. The code also defaults to `google/lever` when the UID variable is absent.

The application requests these scopes (defined in `shared/google-workspace/connection.ts`):

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.freebusy`
- `https://www.googleapis.com/auth/contacts.readonly`

Allow these scopes in the connector and configure the Google consent screen accordingly. Google's verification requirements for Gmail scopes apply when making the app available beyond its permitted testing audience.

Redeploy through Eve after changing deployment environment variables. Use Node 24, the repository-local CLI, and `--scope palette-labs-inc` for Vercel CLI operations.

For CLI credential entry, the repository-local CLI supports:

```sh
./node_modules/.bin/vercel connect create google \
  --connection-method oauth --name lever \
  --data @/absolute/path/outside/repository/google-oauth.json \
  --scope palette-labs-inc
```

The temporary JSON contains `clientId` and `clientSecret`. Use a file outside the repository with owner-only permissions and delete it immediately after the command finishes. Do not pass credentials inline. The dashboard form avoids creating this file.

## 3. Authorize your Google account

Visit [Lever → Connections](https://lever-six.vercel.app/#connections-heading), sign in to Lever with your phone number, and choose **Connect** next to **Google Workspace**. Sign in to the Google account whose inbox you want Lever to use and grant the requested permissions.

Then text “Can you read my emails?” Lever checks connection status and includes this page link if setup is needed. For an actual inbox request, it uses the Gmail tools and lets Vercel Connect handle any required authorization challenge.

The existing internal subject issuer and storage namespaces retain their historical names so changing the display name does not disconnect existing accounts or orphan stored data.
