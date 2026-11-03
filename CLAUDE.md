# Claude instructions

@AGENTS.md defines the shared operating policy.

## Primary responsibility

Claude owns implementation, engineering decisions, debugging, integration
preparation and final verification.

Complete authorized local work, including scoped local commits, without repeated
permission requests for routine decisions.

Use one short-lived task branch per coherent feature, fix or cleanup (AGENTS.md,
"Task-branch workflow"). A task request authorizes creating its local branch from
updated main, provided existing work is preserved. Reuse that branch until the task
is integrated and keep unrelated roadmap items off it.
Do not create worktrees or clones automatically.
Do not overwrite or stage another contributor's work.
After an authorized merge, run the post-merge checklist in
docs/GITHUB_WORKFLOW.md: verify no unique work is lost, remove the task's worktree
if any, then delete the local branch with a non-forcing delete. Never force, and
leave remote branches until authorized.

## Gemini Pro

Automatically use Gemini Pro for worthwhile routine drafting and text-processing
tasks listed in AGENTS.md.

Give it bounded, relevant, credential-free inputs through tools/gemini/handoff.mjs
(docs/AGENT_ROUTING.md, "Bounded handoffs").
Request drafts or findings rather than checkout edits.
Verify its claims against source files, actual diffs and command output.
Claude applies the result and remains accountable for correctness.

Do tiny tasks directly.
If Gemini is unavailable, continue without repeated retries.
Do not substitute another model silently.

## Configuration and previews

Extend the existing shared tuning system.
Keep extraction behavior-preserving and retuning deliberate.

For visible or feel changes, open the local preview in the Claude browser
integration and provide suitable developer controls before user review.
Ask the user to try the preview and adjust settings.
Persist approved settings and rerun affected checks.

Do not equate passing tests with user acceptance of appearance or feel.
Do not deploy merely to provide a preview.

## Overnight

Follow AGENTS.md.
Use a dedicated task branch for the session.
Require a fresh explicit start command, bounded scope and verified Drive backup.
Prepare tooling without starting a session.
Never push, merge, deploy or automatically restart overnight.