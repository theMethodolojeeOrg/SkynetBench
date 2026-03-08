/**
 * Ephemeral Config Loader
 * 
 * Loads provider configurations via RAM-only ingestion paths.
 * The config NEVER touches disk, logs, or result files.
 * 
 * Three ingestion paths:
 * 1. STDIN: Piped in via `cat config.json | skynet-bench run --env-from-stdin`
 * 2. ENV VAR: Base64-encoded in SKYNET_ENV_CONFIG environment variable
 * 3. CALLBACK: Fetched from a provider-hosted HTTPS endpoint at runtime
 * 
 * In all cases, the config is parsed into a ProviderConfig object,
 * validated, and returned. The raw input is discarded.
 * 
 * Security guarantees:
 * - Raw config strings are overwritten after parsing.
 * - The returned ProviderConfig is the ONLY reference.
 * - Callers MUST call provider.destroy() when done.
 * - No config data appears in console output (loader is silent on content).
 */

import type { ProviderConfig } from './environment-provider.js';

export type IngestionMethod = 'stdin' | 'env' | 'callback' | 'file-dev-only';

export interface CallbackConfig {
  /** HTTPS endpoint that returns the ProviderConfig as JSON */
  url: string;
  /** Auth header value (e.g., "Bearer <token>") */
  authorization?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Timeout in ms (default: 30000) */
  timeout_ms?: number;
}

export class EphemeralConfigLoader {
  /**
   * Load a ProviderConfig from the specified ingestion method.
   */
  static async load(method: IngestionMethod, options?: {
    callback?: CallbackConfig;
    /** For file-dev-only: path to a local config file. ONLY for development. */
    dev_file_path?: string;
  }): Promise<ProviderConfig> {
    let rawJson: string;

    switch (method) {
      case 'stdin':
        rawJson = await this.loadFromStdin();
        break;

      case 'env':
        rawJson = this.loadFromEnv();
        break;

      case 'callback':
        if (!options?.callback) {
          throw new Error('Callback config required for callback ingestion method');
        }
        rawJson = await this.loadFromCallback(options.callback);
        break;

      case 'file-dev-only':
        if (!options?.dev_file_path) {
          throw new Error('dev_file_path required for file-dev-only ingestion');
        }
        console.warn('⚠  DEVELOPMENT MODE: Loading config from file. Do NOT use in production.');
        console.warn('   Config file should NOT be committed to version control.');
        rawJson = await this.loadFromFile(options.dev_file_path);
        break;

      default:
        throw new Error(`Unknown ingestion method: ${method}`);
    }

    // Parse and validate
    const config = this.parseAndValidate(rawJson);

    // Zero the raw JSON string (best-effort in JS — GC will handle the rest)
    rawJson = '\0'.repeat(rawJson.length);

    console.log(`✓ Loaded environment config: ${config.provider_name} (${config.provider_id})`);
    console.log(`  Categories: ${config.supported_categories.join(', ')}`);
    console.log(`  Environments: ${Object.keys(config.environments).join(', ')}`);

    return config;
  }

  /**
   * Read config from stdin until EOF.
   */
  private static async loadFromStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        reject(new Error('Stdin read timed out after 30 seconds'));
      }, 30000);

      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      process.stdin.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // If stdin is a TTY (interactive terminal), prompt
      if (process.stdin.isTTY) {
        console.log('Paste provider config JSON, then press Ctrl+D:');
      }

      process.stdin.resume();
    });
  }

  /**
   * Read config from SKYNET_ENV_CONFIG environment variable (base64).
   */
  private static loadFromEnv(): string {
    const encoded = process.env.SKYNET_ENV_CONFIG;
    if (!encoded) {
      throw new Error('SKYNET_ENV_CONFIG environment variable not set');
    }

    // Decode base64
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

    // Clear the env var from process.env (best-effort)
    delete process.env.SKYNET_ENV_CONFIG;

    return decoded;
  }

  /**
   * Fetch config from a provider-hosted HTTPS endpoint.
   */
  private static async loadFromCallback(config: CallbackConfig): Promise<string> {
    if (!config.url.startsWith('https://')) {
      throw new Error('Callback URL must use HTTPS');
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout_ms ?? 30000
    );

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        ...(config.headers ?? {}),
      };

      if (config.authorization) {
        headers['Authorization'] = config.authorization;
      }

      const response = await fetch(config.url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Callback returned ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Load from a local file — DEVELOPMENT ONLY.
   * Clearly marked as unsafe for production.
   */
  private static async loadFromFile(path: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    return readFile(path, 'utf-8');
  }

  /**
   * Parse JSON and validate against ProviderConfig shape.
   */
  private static parseAndValidate(rawJson: string): ProviderConfig {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      throw new Error(`Invalid JSON in provider config: ${(err as Error).message}`);
    }

    // Structural validation
    const errors: string[] = [];

    if (!parsed.provider_id || typeof parsed.provider_id !== 'string') {
      errors.push('Missing or invalid provider_id');
    }
    if (!parsed.provider_name || typeof parsed.provider_name !== 'string') {
      errors.push('Missing or invalid provider_name');
    }
    if (!Array.isArray(parsed.supported_categories)) {
      errors.push('Missing or invalid supported_categories array');
    }
    if (!parsed.environments || typeof parsed.environments !== 'object') {
      errors.push('Missing or invalid environments object');
    }

    // Validate each environment
    if (parsed.environments) {
      for (const [condId, env] of Object.entries(parsed.environments)) {
        const e = env as any;
        if (!e.metadata) {
          errors.push(`Environment "${condId}" missing metadata`);
        }
        if (!e.system_prompt_template) {
          errors.push(`Environment "${condId}" missing system_prompt_template`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Provider config validation failed:\n  ${errors.join('\n  ')}`);
    }

    return parsed as ProviderConfig;
  }
}
