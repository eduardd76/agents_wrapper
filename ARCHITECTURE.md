# Multi-Agent Orchestrator - Architecture

## Overview

The Multi-Agent Orchestrator is a TypeScript-based system that enables developers to execute coding tasks across multiple AI agents (Claude, OpenAI, Gemini, local-operator) simultaneously and compare their responses in real-time.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interfaces                          │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │   CLI Interface  │         │   Web Interface  │         │
│  │  (Commander.js)  │         │    (Next.js)     │         │
│  └────────┬─────────┘         └─────────┬────────┘         │
└───────────┼─────────────────────────────┼──────────────────┘
            │                             │
┌───────────▼─────────────────────────────▼──────────────────┐
│                  Core Layer (@core)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           AgentOrchestrator (Main Coordinator)         │ │
│  └──┬──────────────┬──────────────┬──────────────┬────────┘ │
│     │              │              │              │          │
│  ┌──▼────────┐ ┌──▼────────┐ ┌──▼────────┐ ┌──▼────────┐  │
│  │  Session  │ │   Task    │ │  Output   │ │  Config   │  │
│  │  Manager  │ │  Router   │ │Aggregator │ │  Manager  │  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Adapter Layer (@adapters)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            AgentAdapter Interface                      │ │
│  └──┬──────────┬──────────┬──────────────┬───────────────┘ │
│  ┌──▼──────┐ ┌▼─────┐ ┌──▼──────┐ ┌─────▼──────────┐      │
│  │ Claude  │ │OpenAI│ │ Gemini  │ │ LocalOperator  │      │
│  │ Adapter │ │Adapter│ │ Adapter │ │    Adapter     │      │
│  └─────────┘ └──────┘ └─────────┘ └────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. AgentAdapter Interface

The foundation of the system - all AI agents implement this interface:

```typescript
abstract class AgentAdapter {
  abstract execute(task: string, options?: ExecutionOptions): Promise<AgentResponse>;
  abstract stream(task: string, onChunk: StreamChunkHandler, options?: ExecutionOptions): Promise<AgentResponse>;
  abstract getCapabilities(): AgentCapabilities;
  abstract validateConfig(): Promise<ConfigValidation>;
  abstract healthCheck(): Promise<boolean>;
}
```

**Key Features:**
- Unified interface for all AI providers
- Support for both streaming and non-streaming execution
- Built-in retry logic and error handling (via BaseAdapter)
- Cost calculation specific to each provider

### 2. AgentOrchestrator

Main coordinator for multi-agent execution:

```typescript
class AgentOrchestrator {
  async executeSingle(task: string, agentName: string): Promise<AgentResponse>
  async executeMultiple(task: string, agentNames: string[]): Promise<OrchestrationResult>
  async streamMultiple(task: string, agentNames: string[], onChunk: StreamChunkHandler): Promise<OrchestrationResult>
}
```

**Responsibilities:**
- Parallel execution using `Promise.allSettled()`
- Streaming response multiplexing
- Session management integration
- Metrics aggregation (timing, cost, tokens)

### 3. SessionManager

Maintains conversation context per agent:

```typescript
class SessionManager {
  async getOrCreateSession(sessionId: string, agentName: string): Promise<SessionContext>
  async addMessage(sessionId: string, agentName: string, message: ConversationMessage): Promise<void>
  async getHistory(sessionId: string, agentName: string): Promise<ConversationMessage[]>
}
```

**Storage:**
- File-based by default: `~/.multi-agent/sessions/{sessionId}/{agentName}.json`
- Pluggable interface supports Redis or other backends
- Tracks tokens, cost, and message count

### 4. ConfigManager

Secure API key management:

```typescript
class ConfigManager {
  async loadConfig(): Promise<OrchestratorConfig>
  async setCredential(agentName: string, apiKey: string): Promise<void>
  async validateAll(): Promise<Map<string, ConfigValidation>>
}
```

**Security:**
- Environment variables take precedence
- Encrypted config file fallback at `~/.multi-agent/config.json`
- File permissions set to 0600 (owner read/write only)
- API keys masked in logs

## Adapter Implementations

### ClaudeAdapter

```typescript
// Pricing: $3/$15 per million tokens (input/output) for Sonnet 3.5
// Models: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-opus-4-5-20251101
// Context: 200K tokens
// Streaming: Full support with token-by-token delivery
```

### OpenAIAdapter

```typescript
// Pricing: $0.15/$0.60 per million tokens for gpt-4o-mini
// Models: gpt-4o, gpt-4o-mini, gpt-4-turbo
// Context: 128K tokens
// Streaming: Full support with usage metadata
```

### GeminiAdapter

```typescript
// Pricing: Free for gemini-2.0-flash-exp (preview)
// Models: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
// Context: 1M tokens (Gemini 1.5)
// Streaming: Full support
```

### LocalOperatorAdapter

```typescript
// Integration: HTTP API (preferred) or CLI execution
// Capabilities: Code execution (main feature!)
// Streaming: Simulated (not natively supported)
// Cost: Depends on underlying model (OpenAI/Ollama/etc.)
```

## Data Flow

### Multi-Agent Comparison Flow

```
User: "Compare Claude, OpenAI, Gemini on: Implement binary search"
  │
  ├─> TaskRouter validates agents available
  │
  ├─> SessionManager loads/creates session for EACH agent
  │
  ├─> AgentOrchestrator.executeMultiple()
  │     │
  │     ├─> Parallel execution:
  │     │     ├─> ClaudeAdapter.execute()    ⏱ 3.2s [$0.015]
  │     │     ├─> OpenAIAdapter.execute()    ⏱ 2.1s [$0.003]
  │     │     └─> GeminiAdapter.execute()    ⏱ 1.8s [$0.000]
  │     │
  │     └─> Promise.allSettled() waits for all
  │
  ├─> OutputAggregator
  │     ├─> Compute metrics (time, tokens, cost)
  │     └─> Identify: fastest, cheapest, most detailed
  │
  ├─> SessionManager saves responses to respective sessions
  │
  └─> Display side-by-side comparison
```

### Streaming Flow

```
User: "Stream comparison from all agents"
  │
  ├─> AgentOrchestrator.streamMultiple()
  │     │
  │     ├─> Start 3 parallel streams:
  │     │     ├─> ClaudeAdapter.stream(task, onChunk)
  │     │     ├─> OpenAIAdapter.stream(task, onChunk)
  │     │     └─> GeminiAdapter.stream(task, onChunk)
  │     │
  │     └─> Multiplex chunks (each tagged with agentName)
  │
  ├─> UI Display
  │     ├─> CLI: Real-time text output
  │     └─> Web: Server-Sent Events → React components
  │
  └─> On complete: Save all responses to sessions
```

## Error Handling

### Retry Strategy

```typescript
// Retry on transient errors (5xx, 429) with exponential backoff
// Fail fast on auth errors (401, 403)
// Max 3 retries by default
```

### Error Types

```typescript
type ErrorCode =
  | 'RATE_LIMIT'        // Retryable
  | 'INVALID_API_KEY'   // Not retryable
  | 'TIMEOUT'           // Retryable
  | 'NETWORK'           // Retryable
  | 'MODEL_ERROR'       // Not retryable
  | 'UNKNOWN'           // Not retryable
```

### Partial Results

In multi-agent mode, if some agents fail:
- Successful responses are returned
- Errors are logged separately
- Metrics calculated only for successful agents

## Cost Tracking

```typescript
// Cost calculated per agent based on:
// - Input tokens × model's input price
// - Output tokens × model's output price
// - Tracked per session for budgeting
// - Aggregated across all agents for comparison
```

## Session Persistence

```
~/.multi-agent/
├── sessions/
│   ├── session-abc123/
│   │   ├── claude.json
│   │   ├── openai.json
│   │   └── gemini.json
│   └── session-def456/
│       └── claude.json
└── config.json
```

## Security Considerations

1. **API Keys**: Never logged, always masked in output
2. **File Permissions**: Config and session files set to 0600
3. **Environment Priority**: Env vars override file config
4. **No Hardcoding**: All credentials from external sources
5. **Validation**: Keys validated before first use

## Performance

### Parallel Execution
- All agents execute simultaneously using `Promise.allSettled()`
- No sequential bottlenecks
- Total time ≈ slowest agent time

### Streaming
- Real-time chunk delivery as generated
- Multiplexing supports concurrent streams
- Minimal memory overhead (chunks not buffered)

## Extensibility

### Adding New Agents

```typescript
// 1. Create adapter implementing AgentAdapter
class MyAdapter extends BaseAdapter {
  async execute(task: string): Promise<AgentResponse> {
    // Implementation
  }
  // ... other methods
}

// 2. Register with orchestrator
orchestrator.registerAdapter(new MyAdapter(config));
```

### Custom Storage Backends

```typescript
// Implement SessionStorageAdapter interface
class RedisSessionStorage implements SessionStorageAdapter {
  async save(sessionId: string, agentName: string, context: SessionContext): Promise<void>
  async load(sessionId: string, agentName: string): Promise<SessionContext | null>
  // ... other methods
}
```

## Future Enhancements

1. **Rate Limiting**: Token bucket algorithm per agent
2. **Cost Controls**: Daily/monthly spending caps with warnings
3. **Web UI**: Next.js interface with SSE streaming
4. **Agent Chaining**: Sequential agent workflows
5. **Response Analysis**: Similarity scoring, quality metrics
6. **Caching**: Response caching for identical queries
