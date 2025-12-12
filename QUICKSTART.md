# Quick Start Guide

Get up and running with Multi-Agent Orchestrator in 5 minutes!

## Step 1: Install Dependencies

```bash
# Navigate to project directory
cd Multi-agents-wrapper

# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install
```

## Step 2: Configure API Keys

Create a `.env` file in the project root:

```bash
# Minimum required: At least one API key
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
GOOGLE_API_KEY=your-google-api-key-here
```

Or use the CLI to configure:

```bash
pnpm cli config --set claude
# Enter your Anthropic API key when prompted
```

## Step 3: Build the Project

```bash
pnpm build
```

## Step 4: Test It Out!

### Try a single agent:

```bash
pnpm cli run "Write a function to check if a number is prime in TypeScript" --agent claude
```

### Compare multiple agents:

```bash
pnpm cli compare "Implement a binary search function" --agents claude,openai,gemini
```

### With streaming:

```bash
pnpm cli compare "Explain how async/await works" --agents claude,openai --stream
```

## Common Commands

```bash
# View configuration
pnpm cli config

# Validate API keys
pnpm cli config --validate

# Run with specific agent
pnpm cli run "<your task>" --agent <claude|openai|gemini|local-operator>

# Compare agents
pnpm cli compare "<your task>" --agents claude,openai,gemini

# Stream responses
pnpm cli run "<your task>" --agent claude --stream

# Use session context
pnpm cli run "Follow-up question" --agent claude --session my-session
```

## Troubleshooting

### "Command not found: pnpm"
```bash
npm install -g pnpm
```

### "Agent 'X' not found"
```bash
# Check configuration
pnpm cli config --validate

# Set API key
pnpm cli config --set <agent-name>
```

### "Module not found" errors
```bash
# Rebuild the project
pnpm clean
pnpm install
pnpm build
```

### Local-operator not working
```bash
# Install local-operator
pip install local-operator

# Start the server (for API mode)
local-operator serve --port 8080

# Or use CLI mode by setting in .env:
LOCAL_OPERATOR_MODE=cli
```

## Example Workflows

### 1. Code Review Comparison

```bash
pnpm cli compare "Review this code for security issues:
function login(username, password) {
  const query = 'SELECT * FROM users WHERE user=' + username;
}" --agents claude,openai
```

### 2. Architecture Decision

```bash
pnpm cli compare "Should I use microservices or monolith for a startup MVP?" \
  --agents claude,openai,gemini \
  --stream
```

### 3. Code Generation

```bash
pnpm cli run "Create a React component for a todo list" --agent claude --stream
```

### 4. Multi-turn Conversation

```bash
# Start conversation
pnpm cli run "Design a REST API for a blog" --agent claude --session blog-api

# Follow up
pnpm cli run "Add authentication endpoints" --agent claude --session blog-api

# Continue
pnpm cli run "Show me the user model" --agent claude --session blog-api
```

## Next Steps

- Read the full [README.md](./README.md) for comprehensive documentation
- Check out [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details
- Explore the source code in `packages/core/src`
- Try building your own agent adapter!

## Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review error messages carefully
3. Validate your configuration: `pnpm cli config --validate`
4. Check API key validity and rate limits
5. Open an issue with full error logs

Happy orchestrating! 🚀
