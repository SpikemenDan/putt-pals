# Agent routing

Claude is the primary assistant.
Gemini Pro handles worthwhile routine drafting and text processing.

| Work | Responsible assistant |
| --- | --- |
| Architecture, interfaces and engineering decisions | Claude |
| Implementation and debugging | Claude |
| Physics, tuning, geometry and solver work | Claude |
| Networking, server behavior and security boundaries | Claude |
| Browser interaction and developer tuning panel | Claude |
| Final diff inspection and verification | Claude |
| Documentation drafts and formatting | Gemini Pro, reviewed by Claude |
| Status summaries from supplied evidence | Gemini Pro, reviewed by Claude |
| Log summaries, link/path checks and triage | Gemini Pro, reviewed by Claude |
| PR descriptions and handoff drafts | Gemini Pro, reviewed by Claude |

## Delegation rules

Routine Gemini Pro delegation is authorized by the project owner.
Do not request permission again for each qualifying handoff.

Claude supplies the smallest useful context and a clear requested output.
Exclude credentials and unrelated personal information.

Gemini returns drafts or findings.
It does not mutate the checkout or perform remote writes.
Claude verifies the underlying evidence and applies approved output.

Avoid delegation when a task is quicker to complete directly.
Make a bounded availability attempt.
If Gemini Pro is unavailable, Claude continues directly and reports the fallback.

Do not silently substitute a different model.
Additional implementation agents require explicit user authorization.

Use the installed CLI or integration according to its actual supported options.
Do not disable trust protections or broaden permissions to make delegation work.