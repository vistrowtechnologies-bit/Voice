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
