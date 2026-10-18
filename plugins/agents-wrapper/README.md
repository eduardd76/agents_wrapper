# agents-wrapper Claude Code plugin

Lets Claude get second opinions from other models through the multi-agent orchestrator.

| Component | Name in Claude Code | What it does |
| --- | --- | --- |
| MCP server | `plugin:agents-wrapper:orchestrator` | Tools `list_agents`, `compare_agents`, `run_agent` |
| Skill | `/agents-wrapper:compare [question]` | Sends a self-contained prompt to the configured models and summarizes agreement and disagreement |
| Subagent | `agents-wrapper:second-opinion` | Sends the current diff out for review and reports only verified issues |

## Install

```bash
/plugin marketplace add eduardd76/agents_wrapper
/plugin install agents-wrapper@agents-wrapper-tools
```

Choose **project** scope to enable it for everyone working in a repository.

## Configure

The plugin asks for optional OpenAI, Google, and Anthropic API keys on install. They are stored in your OS credential store. Leave a key blank to use the matching environment variable instead:

| Agent | Plugin option | Environment fallback | Model override |
| --- | --- | --- | --- |
| `openai` | `openai_api_key` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `gemini` | `google_api_key` | `GOOGLE_API_KEY` | `GEMINI_MODEL` |
| `claude` | `anthropic_api_key` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `local-operator` | none | `LOCAL_OPERATOR_API_URL` (required to enable it) | `LOCAL_OPERATOR_MODEL` |

Only agents with a key (or URL) are registered. Change keys later with `/plugin configure agents-wrapper@agents-wrapper-tools`.

The server reads only its environment. It does not read `.env` files or `~/.multi-agent/config.json`.

## Data and cost

Every call sends the prompt to third-party APIs and is billed to your accounts. The skill and subagent tell Claude to strip secrets before sending, but that is model behavior, not enforcement. Don't enable the plugin in repositories whose code must not leave your machine.

## Develop

The server source is `packages/mcp-server`. It is bundled into the single file `server/index.cjs`, which is committed because installed plugins are copied without running a build.

```bash
pnpm install
pnpm --filter @multi-agent/core build
pnpm --filter @multi-agent/mcp-server build   # rewrites server/index.cjs
claude plugin validate ./plugins/agents-wrapper
claude --plugin-dir ./plugins/agents-wrapper
```

Rebuild and commit `server/index.cjs` whenever `packages/core` or `packages/mcp-server` changes, and bump `version` in `.claude-plugin/plugin.json` so installed copies update.
