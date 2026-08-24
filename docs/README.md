# Vistrow Voice docs

A Mintlify docs project. Preview locally with:

```bash
cd docs
npx mint@latest dev
```

## Deploying to docs.vistrowvoice.com

This directory is content + config only — it isn't hosted yet. To go live:

1. Create a Mintlify account at [mintlify.com](https://mintlify.com) and connect this GitHub repo, pointing it at the `docs/` directory.
2. In Mintlify's dashboard, add a custom domain: `docs.vistrowvoice.com`.
3. Add the CNAME record Mintlify gives you to Vistrow's DNS (wherever `vistrowvoice.com` is managed).
4. Push to `main` — Mintlify redeploys automatically on every push once connected.

## Editing

- `docs.json` — navigation, theme colors, logo, navbar links. Colors are pulled from `web-demo/src/index.css`'s `--color-primary`/`--color-primary-dark` — keep them in sync if the brand palette changes.
- Every page is an `.mdx` file; add a new one and list it under the right group in `docs.json` to make it appear in the sidebar.
- `npx mint@latest broken-links` checks every internal link before you push.
