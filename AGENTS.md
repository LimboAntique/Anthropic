# Project Rules

These rules apply to the entire repository.

1. **Minimal code**: Accomplish every task with as little code as possible. Avoid unnecessary abstractions, files, dependencies, and boilerplate.
2. **Comments**: Write all comments in English. Comments describe what the code does and how it works — never the purpose or content of the current change (no "added X", "fixed Y", "changed for Z").
3. **Languages**: Only Python, TypeScript, or Bash are allowed in this project.

## Plan

Read `/Users/blakexu/Documents/PythonProjects/Anthropic/PLAN.md` before any work. Its §8 TODO is the single shared status table — always read and edit it at that absolute path, even from a git worktree.

- Start a task only when all its dependencies are `[x]`; claim it by changing `[ ]` to `[~]` plus your track name.
- Edit only the files your track owns (§4). `src/types.ts` is frozen: if it must change, stop and report.
- When the task's acceptance check passes, mark it `[x]` with the commit hash. Edit only your own TODO line.
