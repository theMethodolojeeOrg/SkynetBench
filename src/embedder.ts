/**
 * Embedding Client
 *
 * Handles embedding of model responses via multiple embedding models.
 * Supports multi-embedder approach: always run both a neutral embedder
 * and a sibling embedder for methodological triangulation.
 *
 * Key concepts:
 * - Neutral embedder: provider-independent (e.g., Nomic). Reproducibility anchor.
 * - Sibling embedder: same provider as subject model (e.g., OpenAI embedding for GPT).
 *   Conservative measurement — any drift detected despite representational familiarity
 *   is a lower bound on the real effect.
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

  constructor(config: {
    apiKey: string;
    baseURL?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://openrouter.ai/api/v1';
  }

  /**
   * Embed a single text using the specified embedding model.
   * Uses OpenRouter's /api/v1/embeddings endpoint.
   */
  async embed(
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
   * Embed all runs in an experiment directory using all configured embedding models.
   * Outputs vectors per embedder to results/scored/{experiment_id}/embeddings/{embedder_id}/
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
      console.log(`  Embedder: ${embedder.name} (${embedder.id})`);

      const results: EmbeddingResult[] = [];

      // Process in batches to respect rate limits
      for (let i = 0; i < runs.length; i += maxConcurrent) {
        const batch = runs.slice(i, i + maxConcurrent);
        const embedPromises = batch.map(async (run) => {
          const vector = await this.embed(embedder.id, run.response.content);
          return {
            run_id: run.run_id,
            embedder_id: embedder.id,
            vector,
            timestamp: new Date().toISOString(),
          } satisfies EmbeddingResult;
        });

        const batchResults = await Promise.all(embedPromises);
        results.push(...batchResults);

        if (i + maxConcurrent < runs.length) {
          console.log(`    Embedded ${Math.min(i + maxConcurrent, runs.length)}/${runs.length}`);
        }
      }

      const batch: EmbeddingBatch = {
        embedder_id: embedder.id,
        embedder_name: embedder.name,
        is_neutral: embedder.is_neutral ?? false,
        sibling_provider: embedder.sibling_provider,
        results,
      };
      batches.push(batch);

      // Save vectors compactly (no pretty-printing for the vector arrays)
      const embeddingsDir = join(experimentDir, 'embeddings', this.sanitizeId(embedder.id));
      await mkdir(embeddingsDir, { recursive: true });
      await writeFile(
        join(embeddingsDir, 'vectors.json'),
        JSON.stringify({
          embedder_id: embedder.id,
          embedder_name: embedder.name,
          is_neutral: embedder.is_neutral ?? false,
          sibling_provider: embedder.sibling_provider,
          dimensions: embedder.dimensions,
          count: results.length,
          results: results.map(r => ({
            run_id: r.run_id,
            vector: r.vector,
          })),
        }),
        'utf-8'
      );

      console.log(`    Saved ${results.length} embeddings -> ${embeddingsDir}/`);
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
