# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

# karpathy-guidelines
- **karpathy-guidelines** (`.claude/skills/karpathy-guidelines/SKILL.md`) - behavioural rules for writing/reviewing/refactoring code.

These are always in force for code work in this repo, not something to wait for a trigger on. In short: state assumptions instead of guessing and ask when unclear; write the minimum code that solves the problem; keep edits surgical so every changed line traces to the request; and turn each task into a verifiable success criterion before starting. Read the skill file for the full text when doing substantial work.
