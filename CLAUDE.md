# Claude instructions

@AGENTS.md defines the shared operating policy.

## Primary responsibility

Claude owns implementation, engineering decisions, debugging, integration
preparation and final verification.

Complete authorized local work, including scoped local commits, without repeated
permission requests for routine decisions.

Reuse the contributor's development branch.
Do not create branches, worktrees or clones automatically.
Do not overwrite or stage another contributor's work.

## Gemini Pro

Automatically use Gemini Pro for worthwhile routine drafting and text-processing
tasks listed in AGENTS.md.

Give it bounded, relevant, credential-free inputs.
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
Require a fresh explicit start command, bounded scope and verified Drive backup.
Prepare tooling without starting a session.
Never push, merge, deploy or automatically restart overnight.