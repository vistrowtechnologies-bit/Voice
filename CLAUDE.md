## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Working with Codex

Codex also works on this repo (its instructions are in AGENTS.md). Coordinate
through the agent bridge issue:
https://github.com/vistrowtechnologies-bit/Voice/issues/2

- Start of every task: read the newest comments there for open `[CLAIM]`s,
  `[QUESTION] @claude`, and `[DONE]` handoffs.
- Before editing: comment `[CLAIM] claude · branch <branch> · <files/area> · <goal>`.
  Don't edit files Codex has an open claim on.
- When finishing or stopping: comment a `[DONE]` handoff covering what changed,
  what was verified, what is unverified or assumed, and what's left for Codex.

## Parallel sessions: lanes, overlap check, one deployer

Several Claude and Codex sessions work on this repo at the same time. These
rules keep their changes from colliding (owner rule, 2026-10-16):

1. **One lane per session.** Each session owns one area and stays in it:
   voice cloning; call runtime (`agent/`, `orchestrator/`); dashboard and
   website (`web-demo/`); server, billing and integrations (`server/`); SEO
   and marketing. Work outside your lane needs a `[CLAIM]` first.
2. **Run the overlap check before claiming and before opening a PR:**
   `python3 scripts/agent_overlap.py --files <files you will edit>` (before)
   and `python3 scripts/agent_overlap.py` (on your branch, before the PR).
   Exit code 1 means another open PR or claim touches the same files: stop,
   ask on issue #2 with `[QUESTION] @<agent>`, and wait or split the work.
3. **Claim narrowly.** Name files or functions, not whole folders. A claim of
   `agent/` blocks everyone else's call-runtime work. Large shared files
   (`agent/main.py`, `agent/tools.py`, `server/calls_db.py`,
   `server/token_api.py`) need a function-level claim.
4. **Always close claims.** Post `[DONE]` naming the branch when you stop,
   even if the work was dropped. Stale claims block other sessions.
5. **Work in a worktree on your own branch**, never directly on `main`.
   Bring the branch up to date with `origin/main` and re-run the tests before
   the PR.
6. **One deployer.** Only the session the owner names merges and deploys, in
   batches (Vercel deploy limit, 3-6 min Railway outage per deploy). Other
   sessions stop at "PR ready" and post `[DONE]`.
7. **Merge combined.** When several PRs ship together, merge them into one
   release branch, run every affected test suite on the combined code, then
   merge once.

## Shared message box and takeover

Read `docs/AGENT-MESSAGE-BOX.md` at the start of every task, alongside issue #2.
Update its current status and append a dated message after each meaningful edit,
verification, merge/deployment, or change in findings. Record branch/commit/PR,
files changed, evidence, remaining work, and the exact next step. Update it before
stopping or reaching a context/token limit so the other agent can take over.
Separate verified facts from hypotheses. Never include credentials, raw caller
speech, or private recordings. Keep GitHub claims/releases too: branches and
worktrees do not automatically share uncommitted messages. At checkpoints,
commit the message box and mirror its handoff to issue #2. Read the latest main
copy and relevant branch/issue updates before taking over; do not overwrite a
peer's active claim or another agent's entries. This rule applies reciprocally
to Codex and Claude. Neither agent is assumed to be running or reading live.
