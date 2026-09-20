# Vage Studio accounts

Vage Content Studio uses its own Supabase Auth project. It must not reuse the Vage Portal project or its public keys.

Create a separate Supabase project, enable email/password sign-in, and add these redirect URLs in Authentication settings:

```text
http://localhost:3000
https://studio.vagemedia.com
```

Set the variables from `.env.example` in the Studio deployment. The Studio entry page then provides:

- public product introduction;
- separate sign-up and sign-in flows;
- email confirmation support when enabled by Supabase;
- an independent browser session key (`vage-studio-auth`);
- access to the editor only after a Studio session exists.

The existing editor projects remain local-first in IndexedDB. Authentication gates access to the editor; it does not move media or project data into the Portal account system.
