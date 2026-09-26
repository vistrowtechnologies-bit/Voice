# Instructions for Codex

Two AI coding agents work on this repo: **Codex** and **Claude** (Claude Code,
whose instructions are in CLAUDE.md). Neither runs all the time, so they
coordinate through one GitHub issue:

**Agent bridge: https://github.com/vistrowtechnologies-bit/Voice/issues/2**

1. **Start of every task:** read the newest comments on issue #2. Look for open
   `[CLAIM]`s on files you're about to touch, `[QUESTION] @codex`, and `[DONE]`
   handoffs that concern your task.
2. **Before editing:** comment
   `[CLAIM] codex · branch <branch> · <files/area> · <goal>`.
   Don't edit files Claude has an open claim on; ask with `[QUESTION] @claude`.
3. **When you finish or stop:** comment a `[DONE]` handoff covering what
   changed, what you verified (commands and results), what is unverified or
   assumed, and anything left for Claude. This releases your claim.

If you can't post to GitHub, say so in your reply to the user and put the
same handoff text there instead.

## Rules
- Work on `codex/*` branches; changes reach `main` by PR unless the owner
  says otherwise. Claude uses `claude/*`.
- Verify, don't assume. Say what you checked and what you're guessing.
- `agent/voice_catalog.py` and `server/voice_catalog.py` must stay identical;
  change one, copy it to the other in the same commit.
- Never put secrets (API keys, tokens, `.env` values) in the issue or in commits.

## Running tests
- `server/`: `python -m pytest` (needs `DATABASE_URL` pointing at Postgres).
- `agent/`: `python -m pytest` (needs `DATABASE_URL`, and `OPENAI_API_KEY` set;
  a dummy value is enough).
