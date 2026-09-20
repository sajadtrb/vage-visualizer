# Vage Content Studio deployment

## Vercel project

Create or connect a Vercel project with `vage-visualizer` as its project root.
Use the existing build command:

```text
npm run build
```

Add the custom domain:

```text
studio.vagemedia.com
```

## Studio-only authentication

Create a separate Supabase project for Studio users. Do not use the Vage Portal
Supabase project or its keys.

Enable Email provider authentication and add these environment variables to the
Vercel project for Preview and Production:

```text
NEXT_PUBLIC_STUDIO_SUPABASE_URL=https://<studio-project>.supabase.co
NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY=<studio-publishable-or-anon-key>
```

Add these redirect URLs in the Studio Supabase authentication settings:

```text
https://studio.vagemedia.com
http://localhost:3000
```

The Studio client keeps its session under a Studio-specific browser key and the
editor remains local-first. Portal accounts are not used by this gate.

## Local preview

Copy `.env.example` to `.env.local` when a Studio Supabase project is ready, then
run:

```text
npm run dev
```

Without the Studio keys, production stays locked and local development exposes
the `Continue local preview` button for editor testing only.
