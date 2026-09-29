---
name: preview
description: Build Nestead's production bundle and open it in the Browser pane on localhost:4173, signed in as the test user, so the user can try a change the way it will ship. Use this whenever the user wants to test or click through the app themselves ("/preview", "run the build", "run the build so I can test it", "let me try it", "open the build"), even if they never say "preview". Not for Claude's own checks and screenshots, which use the dev-local demo server.
---

# Preview the build

Build what would ship and serve it at http://localhost:4173 in the Browser pane, signed in, so the user tests the real bundle against the real backend rather than the dev server or the demo.

Run the commands from the repo root, the folder that holds this `.claude/`. Sessions usually start one level up, where the repo is the `Nestead/` subfolder.

## Steps

1. **Note what goes into the build.** Run `git log -1 --oneline` and `git status --short`. Several sessions share this checkout, so the build contains their uncommitted edits as well as yours. Report them; don't stash, commit or discard anything.

2. **Build.** Run `npm run build` (`tsc --noEmit`, then `vite build`). It reads `.env.local`, which must set `VITE_BACKEND=supabase` and both `VITE_SUPABASE_*` values, or `vite.config.ts` refuses to build. If the build fails, show the errors and stop. `dist/` still holds the last good build, and serving it would have the user testing old code.

3. **Serve.** Call `preview_start` with `name: "preview"`, which runs `vite preview --port 4173 --strictPort` on `dist/`. The entry lives in the session folder's `.claude/launch.json`, outside git. If it's missing, add one that runs that command from the repo root, in the same format as the entries already there. The server reads `dist/` from disk on every request, so one that is already running, in this session or another, serves the new build without a restart. If the start fails because 4173 is taken, another session's preview server has it: use that one and `navigate` to http://localhost:4173.

4. **Open the page.** Navigate to http://localhost:4173 plus the page the user named, or the page the change touches: `/` (board), `/lists`, `/pantry`, `/library`, `/search`, `/profile`, `/family`. Navigate even if the tab is already there, because a fresh load picks up the new bundle.

5. **Make sure the user is signed in.** Give the app a moment past "Loading…". If a password field is showing, the pane has no saved session for this address. Ask the user to sign in as the test user in the Browser pane, leaving "Remember me" ticked, and wait for them to say they're in.
   - Don't type the email or password yourself, even if the user puts them in chat. Signing in sends the password to the hosted Supabase auth service, and that step stays with the user. Keep the password out of files, memory and this skill as well.
   - "Remember me" (on by default) keeps the session in localStorage for localhost:4173, and the pane keeps its storage between sessions, so later previews should open signed in. With it unticked, the session lasts only until the tab closes.
   - To see who is signed in, have `javascript_tool` return only `user.email` from the `sb-*-auth-token` entry in localStorage (or sessionStorage), never the token itself. If it isn't the test user, tell the user; switching accounts is theirs to do.
   - The `dev` server on 5173 is a different address with its own sign-in.

6. **Check that it loaded.** Run `read_console_messages` with `onlyErrors`, and confirm the page shows the app's sidebar or tab bar rather than a blank page. The console keeps errors from earlier loads in the same tab; if some show up, `performance.getEntriesByType('resource')` gives the status of each request on this load (return paths only, not query strings). One screenshot is enough for the report. If it times out, the Claude window is probably behind another window; carry on without it.

7. **Report** in a few lines:
   - The URL and the signed-in account. Say that this is the production build against the real Supabase project: the test users live in the production project, so anything done there changes real rows in the test family.
   - The commit it was built from, and any uncommitted files it includes.
   - Console errors from this load, if any.
   - Leave the server running for the user.

## Gotchas

- `vite preview` has no `/api/import`, so importing a recipe from a web address fails here. Everything else behaves as in production.
- Don't use the app on the user's behalf with coordinate clicks. The pane can resize between a screenshot and a click, and a stray click writes to the test family's real data. If you have to interact, use refs from `find` or `read_page`, and prefer reading the page over clicking.
- For a build with no sign-in, when the user asks for the demo, run `npx vite build --mode demo` instead of step 2 and serve it the same way. It runs on the localStorage demo backend.
