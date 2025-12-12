import { AgentAdapter } from './AgentAdapter.js';
import type { AgentError } from '../../types/agent.types.js';
import pRetry from 'p-retry';

/**
 * Base adapter with common functionality for all agents.
 * Provides retry logic, error handling, and timing utilities.
 */
export abstract class BaseAdapter extends AgentAdapter {
  /**
   * Execute a function with retry logic for transient failures.
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries: number = 3
  ): Promise<T> {
    return pRetry(fn, {
      retries,
      onFailedAttempt: (error) => {
        const shouldRetry = this.isRetryableError(error);
        if (!shouldRetry) {
          throw error; // Abort retrying
        }
        console.warn(
          `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      },
    });
  }

  /**
   * Determine if an error is retryable (transient).
   */
  protected isRetryableError(error: any): boolean {
    // Retry on rate limits and server errors
    if (error.status === 429) return true; // Rate limit
    if (error.status >= 500 && error.status < 600) return true; // Server error
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    return false;
  }

  /**
   * Create a standardized AgentError from any error.
   */
  protected createAgentError(error: any): AgentError {
    const status = error.status || error.statusCode;

    if (status === 401 || status === 403) {
      return {
        code: 'INVALID_API_KEY',
        message: 'Invalid or missing API key',
        retryable: false,
        originalError: error,
      };
    }

    if (status === 429) {
      return {
        code: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        retryable: true,
        originalError: error,
      };
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out',
        retryable: true,
        originalError: error,
      };
    }

    if (status >= 500) {
      return {
        code: 'NETWORK',
        message: 'Server error',
        retryable: true,
        originalError: error,
      };
    }

    return {
      code: 'UNKNOWN',
      message: error.message || 'Unknown error occurred',
      retryable: false,
      originalError: error,
    };
  }

  /**
   * Measure execution time of a function.
   */
  protected async measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    return [result, duration];
  }
}
