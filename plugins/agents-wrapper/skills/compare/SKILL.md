---
name: compare
description: Ask other AI models (OpenAI, Gemini, Claude API, local-operator) the same question and compare their answers. Use when the user asks for a second opinion, wants to compare models, or wants another model to check a design, algorithm, or tricky bug.
argument-hint: "[question or task]"
---

Get answers from external models through the `agents-wrapper` orchestrator MCP tools, then compare them.

1. Call `list_agents` to see which agents are configured. If none are, tell the user to set `OPENAI_API_KEY` or `GOOGLE_API_KEY`, or run `/plugin configure agents-wrapper@agents-wrapper-tools`, and stop.
2. Write one **self-contained** prompt. The external models cannot see this repository, the conversation, or any files, so paste in the relevant code, error output, and constraints. Strip secrets, credentials, and anything the user would not want sent to a third-party API.
3. Call `compare_agents` with that prompt. Pass `agents` only if the user named specific models. Use `run_agent` when only one model is wanted.
4. Report back:
   - where the answers agree (higher confidence),
   - where they disagree, and which answer you think is right and why, checked against the actual code where possible,
   - anything an external model got wrong,
   - cost and any agents that failed.

Do not paste the raw answers in full unless the user asks for them. Each call costs money on the user's API accounts, so don't call repeatedly for the same question.

Task from the user: $ARGUMENTS
