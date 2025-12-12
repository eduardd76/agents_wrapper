# Multi-Agent Orchestrator

> Execute coding tasks across multiple AI agents (Claude, OpenAI, Gemini, local-operator) and compare responses in real-time.

## Features

- 🤖 **Multi-Agent Support**: Claude, OpenAI GPT-4, Google Gemini, and local-operator
- ⚡ **Parallel Execution**: Run tasks on multiple agents simultaneously
- 📊 **Side-by-Side Comparison**: Compare responses, timing, cost, and quality
- 🔄 **Streaming**: Real-time response streaming for all agents
- 💬 **Session Management**: Maintain conversation context per agent
- 💰 **Cost Tracking**: Track token usage and costs across all agents
- 🔐 **Secure**: API keys stored securely with proper permissions
- 🎯 **TypeScript**: Fully typed with comprehensive interfaces

## Installation

```bash
# Clone the repository
cd Multi-agents-wrapper

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build
```

## Configuration

Create a `.env` file in the project root:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
GOOGLE_API_KEY=your-google-api-key-here

# Optional: Customize models
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-2.0-flash-exp

# Optional: Local Operator
LOCAL_OPERATOR_MODE=api
LOCAL_OPERATOR_API_URL=http://localhost:8080
LOCAL_OPERATOR_MODEL=openai:gpt-4o-mini
```

Or configure via CLI:

```bash
pnpm cli config --set claude
pnpm cli config --set openai
pnpm cli config --validate
```

## Usage

### Compare Multiple Agents

```bash
# Compare Claude, OpenAI, and Gemini on a coding task
pnpm cli compare "Implement a binary search function in TypeScript" \
  --agents claude,openai,gemini

# With streaming
pnpm cli compare "Create a REST API endpoint" \
  --agents claude,openai \
  --stream
```

Output:
```
📊 Multi-Agent Comparison

┌───────────────┬────────────┬────────────┬────────────┬──────────────┐
│ Agent         │ Status     │ Time       │ Tokens     │ Cost         │
├───────────────┼────────────┼────────────┼────────────┼──────────────┤
│ claude        │ ✓ Success  │ 3200ms     │ 847        │ $0.0127      │
│ openai        │ ✓ Success  │ 2100ms     │ 612        │ $0.0046      │
│ gemini        │ ✓ Success  │ 1800ms     │ 743        │ $0.0000      │
└───────────────┴────────────┴────────────┴────────────┴──────────────┘

📈 Metrics:

⚡ Fastest: gemini (1800ms)
💰 Cheapest: gemini ($0.0000)
💵 Total Cost: $0.0173

📝 Responses:

CLAUDE:
────────────────────────────────────────────────────────────
function binarySearch<T>(arr: T[], target: T): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] === target) {
      return mid;
    } else if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return -1;
}
────────────────────────────────────────────────────────────
...
```

### Run Single Agent

```bash
# Execute on Claude
pnpm cli run "Write a function to reverse a string" --agent claude

# Execute with streaming
pnpm cli run "Explain async/await in JavaScript" \
  --agent openai \
  --stream

# With session context
pnpm cli run "What did we discuss earlier?" \
  --agent claude \
  --session my-session-id
```

### Configuration Management

```bash
# View current configuration
pnpm cli config

# Validate all agents
pnpm cli config --validate

# Set API key
pnpm cli config --set claude
```

## Programmatic Usage

```typescript
import {
  AgentOrchestrator,
  ClaudeAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  SessionManager,
  FileSessionStorage,
  ConfigManager,
} from '@multi-agent/core';

// Initialize
const configManager = new ConfigManager();
const config = await configManager.loadConfig();

const sessionStorage = new FileSessionStorage('~/.multi-agent/sessions');
const sessionManager = new SessionManager(sessionStorage);
const orchestrator = new AgentOrchestrator(sessionManager);

// Register adapters
orchestrator.registerAdapter(new ClaudeAdapter(config.anthropic!));
orchestrator.registerAdapter(new OpenAIAdapter(config.openai!));
orchestrator.registerAdapter(new GeminiAdapter(config.gemini!));

// Execute on multiple agents
const result = await orchestrator.executeMultiple(
  'Implement quicksort in Python',
  ['claude', 'openai', 'gemini']
);

console.log('Fastest:', result.timing.fastestAgent);
console.log('Cheapest:', result.costs.cheapestAgent);
console.log('Total cost:', result.costs.total);

// Streaming example
await orchestrator.streamMultiple(
  'Explain Docker containers',
  ['claude', 'openai'],
  (chunk) => {
    if (!chunk.isComplete) {
      process.stdout.write(`[${chunk.agentName}] ${chunk.delta}`);
    }
  }
);
```

## Architecture

```
packages/
├── core/          # Core orchestration library
│   ├── adapters/  # AI agent adapters
│   ├── orchestrator/  # Main coordinator
│   ├── session/   # Session management
│   └── config/    # Configuration management
├── cli/           # CLI interface (Commander.js)
└── web/           # Web UI (Next.js) [Coming soon]
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Supported Agents

| Agent | Streaming | Code Execution | Image Input | Context |
|-------|-----------|----------------|-------------|---------|
| **Claude** | ✅ | ❌ | ✅ | 200K tokens |
| **OpenAI** | ✅ | ❌ | ✅ | 128K tokens |
| **Gemini** | ✅ | ❌ | ✅ | 1M tokens |
| **local-operator** | ⚠️ (simulated) | ✅ | ❌ | 128K tokens |

## Cost Comparison (Per 1M Tokens)

| Model | Input | Output |
|-------|-------|--------|
| **Claude Sonnet 3.5** | $3.00 | $15.00 |
| **Claude Haiku 3.5** | $0.80 | $4.00 |
| **GPT-4o** | $2.50 | $10.00 |
| **GPT-4o-mini** | $0.15 | $0.60 |
| **Gemini 2.0 Flash** | $0.00 | $0.00 (preview) |
| **Gemini 1.5 Pro** | $1.25 | $5.00 |

## Session Management

Sessions maintain conversation context per agent:

```bash
# Start a session
pnpm cli run "Create a REST API" --agent claude --session dev-123

# Continue the conversation
pnpm cli run "Add authentication to it" --agent claude --session dev-123

# View session summary
pnpm cli session list
pnpm cli session show dev-123
```

Sessions are stored at `~/.multi-agent/sessions/{sessionId}/{agentName}.json`

## Examples

### Example 1: Code Review

```bash
pnpm cli compare "Review this function for security issues:
function login(username, password) {
  const query = 'SELECT * FROM users WHERE user=' + username;
  db.query(query);
}" --agents claude,openai
```

### Example 2: Architectural Decision

```bash
pnpm cli compare "Should I use Redux or Context API for state management in a medium-sized React app?" \
  --agents claude,openai,gemini \
  --stream
```

### Example 3: Code Generation with Execution

```bash
# Use local-operator to actually execute the code
pnpm cli run "Create a script that fetches weather data from an API and displays it" \
  --agent local-operator
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint
```

## Troubleshooting

### "Agent not found" error

Ensure the agent is configured with a valid API key:

```bash
pnpm cli config --validate
pnpm cli config --set <agent-name>
```

### local-operator not working

**API mode:**
```bash
# Start the server
local-operator serve --port 8080
```

**CLI mode:**
```bash
# Set mode in .env
LOCAL_OPERATOR_MODE=cli
```

### Rate limiting

If you hit rate limits, the orchestrator will automatically retry with exponential backoff. To reduce rate limit issues:

- Use cheaper/faster models (gpt-4o-mini, gemini-flash)
- Add delays between requests
- Reduce the number of parallel agents

## Roadmap

- [x] Core orchestration engine
- [x] Claude, OpenAI, Gemini adapters
- [x] local-operator integration
- [x] CLI interface
- [x] Streaming support
- [x] Session management
- [x] Cost tracking
- [ ] Web UI (Next.js)
- [ ] Rate limiting
- [ ] Response caching
- [ ] Agent chaining
- [ ] Quality metrics
- [ ] Cost controls (spending caps)

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT

## Acknowledgments

- [Anthropic](https://www.anthropic.com/) - Claude API
- [OpenAI](https://openai.com/) - GPT-4 API
- [Google](https://ai.google.dev/) - Gemini API
- [local-operator](https://github.com/damianvtran/local-operator) - AI coding agent

---

Built with ❤️ using TypeScript, Commander.js, and modern AI APIs.
