/**
 * OpenRouter API Client
 * 
 * Transplanted from LLMFalsification framework (Tom Oury).
 * Handles all communication with OpenRouter API for both
 * profile generation and subject evaluation.
 */

import type {
  ModelConfig,
  OpenRouterRequest,
  OpenRouterResponse,
  OpenRouterError,
  OpenRouterMessage,
} from './types.js';

export class OpenRouterClient {
  private apiKey: string;
  private baseURL: string = 'https://openrouter.ai/api/v1';
  private siteUrl?: string;
  private siteName?: string;

  constructor(config: {
    apiKey: string;
    siteUrl?: string;
    siteName?: string;
  }) {
    this.apiKey = config.apiKey;
    this.siteUrl = config.siteUrl;
    this.siteName = config.siteName;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
    if (this.siteName) headers['X-Title'] = this.siteName;
    return headers;
  }

  async createCompletion(
    request: OpenRouterRequest,
    retryAttempts: number = 3,
    retryDelayMs: number = 1000
  ): Promise<OpenRouterResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const startTime = Date.now();

        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ ...request, stream: false }),
        });

        const latency = Date.now() - startTime;

        if (!response.ok) {
          const errorData = (await response.json()) as OpenRouterError;

          if (response.status === 429) {
            const backoffDelay = retryDelayMs * Math.pow(2, attempt);
            console.warn(
              `Rate limited. Retrying in ${backoffDelay}ms... (attempt ${attempt + 1}/${retryAttempts})`
            );
            await this.sleep(backoffDelay);
            continue;
          }

          throw new Error(
            `OpenRouter API Error (${response.status}): ${errorData.error?.message || response.statusText}`
          );
        }

        const data = (await response.json()) as OpenRouterResponse;
        (data as any)._latencyMs = latency;
        return data;
      } catch (error) {
        lastError = error as Error;
        if (error instanceof Error && !error.message.includes('Rate limited')) {
          throw error;
        }
        if (attempt < retryAttempts - 1) {
          const backoffDelay = retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `Request failed. Retrying in ${backoffDelay}ms... (attempt ${attempt + 1}/${retryAttempts})`
          );
          await this.sleep(backoffDelay);
        }
      }
    }
    throw lastError || new Error('Request failed after all retry attempts');
  }

  /**
   * Send a chat completion with arbitrary messages.
   * This is the primary interface for both profile generation and subject evaluation.
   */
  async chat(
    modelId: string,
    messages: OpenRouterMessage[],
    params: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      seed?: number;
    } = {},
    retryAttempts: number = 3,
    retryDelayMs: number = 1000
  ): Promise<OpenRouterResponse> {
    return this.createCompletion(
      {
        model: modelId,
        messages,
        ...params,
      },
      retryAttempts,
      retryDelayMs
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<any[]> {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
    const data = await response.json();
    return data.data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
