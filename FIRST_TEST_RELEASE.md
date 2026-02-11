# First GitHub Test Release (Friends)

Date: 2026-02-11

This is the fastest path to publish DatChat for friend testing before the big rework.

## 1) Push Repository to GitHub

```bash
git init
git add .
git commit -m "chore: initial test release prep"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2) Configure GitHub Pages (Browser Link)

1. Open GitHub repo Settings -> Pages.
2. Source: `GitHub Actions`.
3. Run workflow: `Deploy Pages`.
4. Share the generated URL with friends.

Notes:
- This is static hosting for the frontend.
- App still uses your configured Supabase project.

## 3) Create Downloadable Zip Release

Option A (local):

```bash
npm run release:web
```

This creates:
- `artifacts/DatChat-web-<version>.zip`

Option B (GitHub Actions):
- Run workflow `Release Web` manually with a version label.
- Or push a tag:

```bash
git tag v0.1.0-test1
git push origin v0.1.0-test1
```

On tag push, the workflow uploads zip assets to a GitHub Release automatically.

## 4) What Your Friends Need

Browser mode:
- Nothing to install. Use GitHub Pages URL.

Download mode:
- Extract zip.
- Serve static files:
  - `npx serve .`
  - or `python -m http.server 4173`

## 5) Before Sharing

1. Confirm Supabase project is production-ready for test users.
2. Confirm RLS + migrations are up to date.
3. Verify voice token function is deployed if testing calls.
4. Test registration/login/friends/messages in a private browser window.
