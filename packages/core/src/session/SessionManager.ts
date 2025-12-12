import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
  SessionContext,
  ConversationMessage,
  SessionMetadata,
  SessionStorageAdapter,
} from '../types/session.types.js';

/**
 * File-based session storage adapter.
 * Stores sessions in ~/.multi-agent/sessions/{sessionId}/{agentName}.json
 */
export class FileSessionStorage implements SessionStorageAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(
    sessionId: string,
    agentName: string,
    context: SessionContext
  ): Promise<void> {
    const sessionDir = join(this.basePath, sessionId);

    if (!existsSync(sessionDir)) {
      await mkdir(sessionDir, { recursive: true });
    }

    const filePath = join(sessionDir, `${agentName}.json`);
    await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  }

  async load(
    sessionId: string,
    agentName: string
  ): Promise<SessionContext | null> {
    const filePath = join(this.basePath, sessionId, `${agentName}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Convert date strings back to Date objects
      parsed.metadata.createdAt = new Date(parsed.metadata.createdAt);
      parsed.metadata.lastActivity = new Date(parsed.metadata.lastActivity);
      parsed.messages = parsed.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      return parsed;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}/${agentName}:`, error);
      return null;
    }
  }

  async delete(sessionId: string, agentName?: string): Promise<void> {
    if (agentName) {
      // Delete specific agent's session
      const filePath = join(this.basePath, sessionId, `${agentName}.json`);
      if (existsSync(filePath)) {
        await rm(filePath);
      }
    } else {
      // Delete entire session directory
      const sessionDir = join(this.basePath, sessionId);
      if (existsSync(sessionDir)) {
        await rm(sessionDir, { recursive: true });
      }
    }
  }

  async list(sessionId?: string): Promise<string[]> {
    if (sessionId) {
      // List agents in a specific session
      const sessionDir = join(this.basePath, sessionId);
      if (!existsSync(sessionDir)) {
        return [];
      }
      const files = await readdir(sessionDir);
      return files.map((f) => f.replace('.json', ''));
    } else {
      // List all sessions
      if (!existsSync(this.basePath)) {
        return [];
      }
      return await readdir(this.basePath);
    }
  }
}

/**
 * Manages conversation sessions for multiple agents.
 * Each agent maintains separate conversation history within a session.
 */
export class SessionManager {
  private storage: SessionStorageAdapter;
  private sessions: Map<string, Map<string, SessionContext>>;

  constructor(storage: SessionStorageAdapter) {
    this.storage = storage;
    this.sessions = new Map();
  }

  /**
   * Get or create a session context for an agent.
   */
  async getOrCreateSession(
    sessionId: string,
    agentName: string
  ): Promise<SessionContext> {
    // Check in-memory cache first
    if (this.sessions.has(sessionId)) {
      const agentSessions = this.sessions.get(sessionId)!;
      if (agentSessions.has(agentName)) {
        return agentSessions.get(agentName)!;
      }
    }

    // Try loading from storage
    const stored = await this.storage.load(sessionId, agentName);
    if (stored) {
      this.cacheSession(sessionId, agentName, stored);
      return stored;
    }

    // Create new session
    const newSession: SessionContext = {
      sessionId,
      agentName,
      messages: [],
      metadata: {
        createdAt: new Date(),
        lastActivity: new Date(),
        totalTokens: 0,
        totalCost: 0,
        messageCount: 0,
      },
    };

    this.cacheSession(sessionId, agentName, newSession);
    await this.storage.save(sessionId, agentName, newSession);

    return newSession;
  }

  /**
   * Add a message to a session.
   */
  async addMessage(
    sessionId: string,
    agentName: string,
    message: ConversationMessage
  ): Promise<void> {
    const session = await this.getOrCreateSession(sessionId, agentName);

    session.messages.push({
      ...message,
      timestamp: new Date(),
    });

    session.metadata.lastActivity = new Date();
    session.metadata.messageCount = session.messages.length;

    await this.storage.save(sessionId, agentName, session);
  }

  /**
   * Get conversation history for an agent in a session.
   */
  async getHistory(
    sessionId: string,
    agentName: string
  ): Promise<ConversationMessage[]> {
    const session = await this.getOrCreateSession(sessionId, agentName);
    return session.messages;
  }

  /**
   * Update session metadata (tokens, cost).
   */
  async updateMetadata(
    sessionId: string,
    agentName: string,
    updates: Partial<SessionMetadata>
  ): Promise<void> {
    const session = await this.getOrCreateSession(sessionId, agentName);

    session.metadata = {
      ...session.metadata,
      ...updates,
      lastActivity: new Date(),
    };

    await this.storage.save(sessionId, agentName, session);
  }

  /**
   * Clear a session (specific agent or entire session).
   */
  async clearSession(sessionId: string, agentName?: string): Promise<void> {
    if (agentName) {
      // Clear specific agent
      if (this.sessions.has(sessionId)) {
        this.sessions.get(sessionId)!.delete(agentName);
      }
    } else {
      // Clear entire session
      this.sessions.delete(sessionId);
    }

    await this.storage.delete(sessionId, agentName);
  }

  /**
   * Get session metadata across all agents.
   */
  async getSessionSummary(sessionId: string): Promise<{
    agents: string[];
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    lastActivity: Date;
  }> {
    const agents = await this.storage.list(sessionId);
    let totalMessages = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let lastActivity = new Date(0);

    for (const agentName of agents) {
      const session = await this.getOrCreateSession(sessionId, agentName);
      totalMessages += session.metadata.messageCount;
      totalTokens += session.metadata.totalTokens;
      totalCost += session.metadata.totalCost;

      if (session.metadata.lastActivity > lastActivity) {
        lastActivity = session.metadata.lastActivity;
      }
    }

    return {
      agents,
      totalMessages,
      totalTokens,
      totalCost,
      lastActivity,
    };
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<string[]> {
    return await this.storage.list();
  }

  /**
   * Cache session in memory.
   */
  private cacheSession(
    sessionId: string,
    agentName: string,
    session: SessionContext
  ): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    this.sessions.get(sessionId)!.set(agentName, session);
  }
}
