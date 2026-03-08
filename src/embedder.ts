/**
 * Embedding Client
 *
 * Handles embedding of model responses via multiple embedding models.
 * Supports multi-embedder approach: always run both a neutral embedder
 * and a sibling embedder for methodological triangulation.
 *
 * Key concepts:
 * - Neutral embedder: provider-independent (e.g., Qwen, Nomic). Reproducibility anchor.
 * - Sibling embedder: same provider as subject model (e.g., OpenAI embedding for GPT).
 *   Conservative measurement — any drift detected despite representational familiarity
 *   is a lower bound on the real effect.
 *
 * Supports two backends:
 * - OpenRouter: default, uses /api/v1/embeddings endpoint
 * - Nomic: uses @nomic-ai/atlas SDK with NOMIC_API_KEY env var
 *
 * Embedding vectors are stored compactly (no pretty-printing for vectors).
 */

import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type {
  EmbeddingModelConfig,
  EmbeddingResult,
  ExperimentRun,
} from './types.js';

interface EmbeddingBatch {
  embedder_id: string;
  embedder_name: string;
  is_neutral: boolean;
  sibling_provider?: string;
  results: EmbeddingResult[];
}

export class EmbeddingClient {
  private apiKey: string;
  private baseURL: string;
  private nomicApiKey: string | undefined;

  constructor(config: {
    apiKey: string;
    baseURL?: string;
    nomicApiKey?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://openrouter.ai/api/v1';
    this.nomicApiKey = config.nomicApiKey ?? process.env.NOMIC_API_KEY;
  }

  /**
   * Embed a single text using the specified embedding model via OpenRouter.
   */
  async embedViaOpenRouter(
    modelId: string,
    text: string,
    retryAttempts: number = 3,
    retryDelayMs: number = 1000
  ): Promise<number[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            input: text,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const backoff = retryDelayMs * Math.pow(2, attempt);
            console.warn(`Rate limited. Retrying in ${backoff}ms... (attempt ${attempt + 1}/${retryAttempts})`);
            await this.sleep(backoff);
            continue;
          }
          const errorBody = await response.text();
          throw new Error(`Embedding API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json() as {
          data: Array<{ embedding: number[] }>;
        };

        if (!data.data?.[0]?.embedding) {
          throw new Error('No embedding returned in response');
        }

        return data.data[0].embedding;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retryAttempts - 1) {
          const backoff = retryDelayMs * Math.pow(2, attempt);
          console.warn(`Embedding failed. Retrying in ${backoff}ms... (attempt ${attempt + 1}/${retryAttempts})`);
          await this.sleep(backoff);
        }
      }
    }

    throw lastError || new Error('Embedding failed after all retry attempts');
  }

  /**
   * Embed multiple texts using the Nomic Atlas SDK.
   * Batches efficiently — the SDK handles pooling internally.
   */
  async embedViaNomic(
    texts: string[],
    model: 'nomic-embed-text-v1' | 'nomic-embed-text-v1.5' = 'nomic-embed-text-v1.5'
  ): Promise<number[][]> {
    if (!this.nomicApiKey) {
      throw new Error('NOMIC_API_KEY is required for Nomic embeddings. Set it in .env');
    }

    // Dynamic import to avoid requiring the SDK when not using Nomic backend
    const { embed } = await import('@nomic-ai/atlas');
    const embeddings = await embed(texts, { model, taskType: 'clustering' }, this.nomicApiKey);
    return embeddings;
  }

  /**
   * Embed a single text using the appropriate backend for the given model config.
   */
  async embed(
    modelConfig: EmbeddingModelConfig,
    text: string
  ): Promise<number[]> {
    if (modelConfig.backend === 'nomic') {
      const nomicModel = modelConfig.id.includes('v1.5')
        ? 'nomic-embed-text-v1.5' as const
        : 'nomic-embed-text-v1' as const;
      const results = await this.embedViaNomic([text], nomicModel);
      return results[0];
    }
    return this.embedViaOpenRouter(modelConfig.id, text);
  }

  /**
   * Embed all runs in an experiment directory using all configured embedding models.
   * Outputs vectors per embedder to {experiment}/embeddings/{embedder_id}/
   */
  async embedExperiment(
    experimentDir: string,
    embeddingModels: EmbeddingModelConfig[],
    options?: { maxConcurrent?: number }
  ): Promise<EmbeddingBatch[]> {
    const runsDir = join(experimentDir, 'runs');
    const files = await readdir(runsDir);
    const runFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('ERROR'));

    console.log(`Embedding ${runFiles.length} runs with ${embeddingModels.length} embedder(s)...`);

    // Load all runs
    const runs: ExperimentRun[] = [];
    for (const file of runFiles) {
      const raw = await readFile(join(runsDir, file), 'utf-8');
      runs.push(JSON.parse(raw) as ExperimentRun);
    }

    const batches: EmbeddingBatch[] = [];
    const maxConcurrent = options?.maxConcurrent ?? 5;

    for (const embedder of embeddingModels) {
      const embeddingsDir = join(experimentDir, 'embeddings', this.sanitizeId(embedder.id));
      await mkdir(embeddingsDir, { recursive: true });

      // Resume support: load already-embedded run IDs from individual files
      const existingFiles = await readdir(embeddingsDir).catch(() => [] as string[]);
      const alreadyEmbedded = new Map<string, { run_id: string; vector: number[] }>();
      for (const f of existingFiles) {
        if (f.endsWith('.embedding.json')) {
          try {
            const raw = await readFile(join(embeddingsDir, f), 'utf-8');
            const data = JSON.parse(raw) as { run_id: string; vector: number[] };
            alreadyEmbedded.set(data.run_id, data);
          } catch { /* skip corrupt files */ }
        }
      }

      const toEmbed = runs.filter((r) => !alreadyEmbedded.has(r.run_id));
      console.log(`  Embedder: ${embedder.name} (${embedder.id}) [${embedder.backend ?? 'openrouter'}] — ${toEmbed.length} to embed (${alreadyEmbedded.size} already done)`);

      if (toEmbed.length === 0 && alreadyEmbedded.size > 0) {
        // All done already — just rebuild vectors.json from individual files
      } else if (embedder.backend === 'nomic') {
        // Nomic SDK handles batching internally — send all texts at once
        const texts = toEmbed.map((run) => run.response.content);
        try {
          const vectors = await this.embedViaNomic(texts);
          for (let i = 0; i < toEmbed.length; i++) {
            const result = {
              run_id: toEmbed[i].run_id,
              vector: vectors[i],
            };
            // Write immediately
            await writeFile(
              join(embeddingsDir, `${result.run_id}.embedding.json`),
              JSON.stringify(result),
              'utf-8'
            );
            alreadyEmbedded.set(result.run_id, result);
          }
        } catch (error) {
          console.error(`    Failed: ${(error as Error).message}`);
          continue;
        }
      } else {
        // OpenRouter: process in batches to respect rate limits
        let failures = 0;
        for (let i = 0; i < toEmbed.length; i += maxConcurrent) {
          const batch = toEmbed.slice(i, i + maxConcurrent);
          const embedPromises = batch.map(async (run) => {
            try {
              const vector = await this.embedViaOpenRouter(embedder.id, run.response.content);
              const result = { run_id: run.run_id, vector };
              // Write immediately
              await writeFile(
                join(embeddingsDir, `${result.run_id}.embedding.json`),
                JSON.stringify(result),
                'utf-8'
              );
              return result;
            } catch (error) {
              failures++;
              console.warn(`    Skipping ${run.run_id}: ${(error as Error).message}`);
              return null;
            }
          });

          const batchResults = await Promise.all(embedPromises);
          for (const r of batchResults) {
            if (r) alreadyEmbedded.set(r.run_id, r);
          }

          const done = Math.min(i + maxConcurrent, toEmbed.length) + (runs.length - toEmbed.length);
          console.log(`    Embedded ${done - failures}/${runs.length} (${failures} failed)`);
        }
        if (failures > 0) {
          console.warn(`    ${failures} embeddings failed for ${embedder.name}`);
        }
      }

      // Compile all individual files into vectors.json
      const allResults: EmbeddingResult[] = runs.map((run) => {
        const data = alreadyEmbedded.get(run.run_id);
        return {
          run_id: run.run_id,
          embedder_id: embedder.id,
          vector: data?.vector ?? [],
          timestamp: new Date().toISOString(),
        };
      }).filter((r) => r.vector.length > 0);

      const batch: EmbeddingBatch = {
        embedder_id: embedder.id,
        embedder_name: embedder.name,
        is_neutral: embedder.is_neutral ?? false,
        sibling_provider: embedder.sibling_provider,
        results: allResults,
      };
      batches.push(batch);

      // Write compiled vectors.json
      await writeFile(
        join(embeddingsDir, 'vectors.json'),
        JSON.stringify({
          embedder_id: embedder.id,
          embedder_name: embedder.name,
          is_neutral: embedder.is_neutral ?? false,
          sibling_provider: embedder.sibling_provider,
          dimensions: embedder.dimensions,
          count: allResults.length,
          results: allResults.map(r => ({
            run_id: r.run_id,
            vector: r.vector,
          })),
        }),
        'utf-8'
      );

      console.log(`    Saved ${allResults.length} embeddings -> ${embeddingsDir}/`);
    }

    return batches;
  }

  private sanitizeId(id: string): string {
    return id.replace(/\//g, '_');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
