import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';
import type { AgentConfig, ConfigValidation } from '../types/agent.types.js';

export interface OrchestratorConfig {
  anthropic?: AgentConfig;
  openai?: AgentConfig;
  gemini?: AgentConfig;
  localOperator?: {
    mode: 'api' | 'cli';
    apiUrl?: string;
    model?: string;
  };
  session?: {
    storagePath?: string;
  };
  costControls?: {
    maxDailySpend?: number;
    maxMonthlySpend?: number;
    warnThreshold?: number;
  };
}

/**
 * Manages configuration and API keys for all agents.
 * Prioritizes environment variables, falls back to config file.
 */
export class ConfigManager {
  private configPath: string;
  private config: OrchestratorConfig;

  constructor(configPath?: string) {
    this.configPath =
      configPath || join(homedir(), '.multi-agent', 'config.json');
    this.config = {};
  }

  /**
   * Load configuration from environment variables and config file.
   */
  async loadConfig(): Promise<OrchestratorConfig> {
    // Load environment variables
    loadEnv();

    // Load from config file if exists
    if (existsSync(this.configPath)) {
      try {
        const fileContent = await readFile(this.configPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);
        this.config = { ...fileConfig, ...this.config };
      } catch (error) {
        console.warn('Failed to load config file:', error);
      }
    }

    // Environment variables take precedence
    this.config.anthropic = {
      apiKey:
        process.env.ANTHROPIC_API_KEY ||
        this.config.anthropic?.apiKey ||
        '',
      model: process.env.ANTHROPIC_MODEL || this.config.anthropic?.model || 'claude-3-5-sonnet-20241022',
    };

    this.config.openai = {
      apiKey: process.env.OPENAI_API_KEY || this.config.openai?.apiKey || '',
      model: process.env.OPENAI_MODEL || this.config.openai?.model || 'gpt-4o-mini',
    };

    this.config.gemini = {
      apiKey:
        process.env.GOOGLE_API_KEY || this.config.gemini?.apiKey || '',
      model: process.env.GEMINI_MODEL || this.config.gemini?.model || 'gemini-2.0-flash-exp',
    };

    this.config.localOperator = {
      mode:
        (process.env.LOCAL_OPERATOR_MODE as 'api' | 'cli') ||
        this.config.localOperator?.mode ||
        'api',
      apiUrl:
        process.env.LOCAL_OPERATOR_API_URL ||
        this.config.localOperator?.apiUrl ||
        'http://localhost:8080',
      model:
        process.env.LOCAL_OPERATOR_MODEL ||
        this.config.localOperator?.model ||
        'openai:gpt-4o-mini',
    };

    this.config.session = {
      storagePath:
        process.env.SESSION_STORAGE_PATH ||
        this.config.session?.storagePath ||
        join(homedir(), '.multi-agent', 'sessions'),
    };

    this.config.costControls = {
      maxDailySpend:
        parseFloat(process.env.MAX_DAILY_SPEND || '') ||
        this.config.costControls?.maxDailySpend ||
        10.0,
      maxMonthlySpend:
        parseFloat(process.env.MAX_MONTHLY_SPEND || '') ||
        this.config.costControls?.maxMonthlySpend ||
        100.0,
      warnThreshold:
        parseFloat(process.env.WARN_THRESHOLD || '') ||
        this.config.costControls?.warnThreshold ||
        0.5,
    };

    return this.config;
  }

  /**
   * Get configuration for a specific agent.
   */
  getAgentConfig(agentName: string): AgentConfig | undefined {
    const configs: Record<string, AgentConfig | undefined> = {
      claude: this.config.anthropic,
      openai: this.config.openai,
      gemini: this.config.gemini,
    };
    return configs[agentName];
  }

  /**
   * Set API key for an agent and persist to config file.
   */
  async setCredential(
    agentName: string,
    apiKey: string
  ): Promise<void> {
    const agentConfigs: Record<string, string> = {
      claude: 'anthropic',
      openai: 'openai',
      gemini: 'gemini',
    };

    const configKey = agentConfigs[agentName];
    if (!configKey) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    // Update in-memory config
    this.config[configKey as keyof OrchestratorConfig] = {
      ...(this.config[configKey as keyof OrchestratorConfig] as AgentConfig),
      apiKey,
    };

    // Persist to file
    await this.saveConfig();
  }

  /**
   * Get credential for an agent (masked for logging).
   */
  getCredential(agentName: string): string | null {
    const config = this.getAgentConfig(agentName);
    return config?.apiKey || null;
  }

  /**
   * Validate all configured agents.
   */
  async validateAll(): Promise<Map<string, ConfigValidation>> {
    const results = new Map<string, ConfigValidation>();

    // Check Claude
    if (this.config.anthropic?.apiKey) {
      results.set('claude', {
        isValid: this.config.anthropic.apiKey.startsWith('sk-ant-'),
        error: !this.config.anthropic.apiKey.startsWith('sk-ant-')
          ? 'Invalid Anthropic API key format'
          : undefined,
      });
    } else {
      results.set('claude', {
        isValid: false,
        error: 'Anthropic API key not configured',
      });
    }

    // Check OpenAI
    if (this.config.openai?.apiKey) {
      results.set('openai', {
        isValid: this.config.openai.apiKey.startsWith('sk-'),
        error: !this.config.openai.apiKey.startsWith('sk-')
          ? 'Invalid OpenAI API key format'
          : undefined,
      });
    } else {
      results.set('openai', {
        isValid: false,
        error: 'OpenAI API key not configured',
      });
    }

    // Check Gemini
    if (this.config.gemini?.apiKey) {
      results.set('gemini', {
        isValid: this.config.gemini.apiKey.length > 20,
        error:
          this.config.gemini.apiKey.length <= 20
            ? 'Invalid Google API key format'
            : undefined,
      });
    } else {
      results.set('gemini', {
        isValid: false,
        error: 'Google API key not configured',
      });
    }

    return results;
  }

  /**
   * Save configuration to file with secure permissions.
   */
  private async saveConfig(): Promise<void> {
    const dir = join(this.configPath, '..');

    // Ensure directory exists
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Write config file
    await writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );

    // Set restrictive permissions (owner read/write only)
    try {
      await chmod(this.configPath, 0o600);
    } catch (error) {
      console.warn('Could not set file permissions:', error);
    }
  }

  /**
   * Get the full orchestrator configuration.
   */
  getConfig(): OrchestratorConfig {
    return this.config;
  }

  /**
   * Mask API key for safe logging.
   */
  static maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 10) return '***';
    return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
  }
}
