/**
 * Embed Responses — CLI Entry Point
 *
 * Embeds all experiment responses using configured embedding models,
 * then runs drift analysis automatically.
 *
 * Usage:
 *   npm run embed-responses -- [experiment-dir] [options]
 *
 * Options:
 *   --embedder MODEL_ID    Only use this embedding model (default: all configured)
 *   --max-concurrent N     Max concurrent embedding API calls (default: 5)
 */

import { config as dotenvConfig } from 'dotenv';
import { readFile, readdir } from 'fs/promises';
import { EmbeddingClient } from '../src/embedder.js';
import { DriftAnalyzer } from '../src/drift-analyzer.js';
import type { EmbeddingModelConfig } from '../src/types.js';

dotenvConfig();

async function main() {
  const args = process.argv.slice(2);

  // Find experiment directory
  let experimentDir = args.find((a) => !a.startsWith('--'));
  if (!experimentDir) {
    try {
      const dirs = await readdir('results/raw-responses');
      const sorted = dirs.sort().reverse();
      if (sorted.length > 0) {
        experimentDir = `results/raw-responses/${sorted[0]}`;
        console.log(`Auto-selected most recent experiment: ${experimentDir}`);
      }
    } catch {
      console.error('Usage: npm run embed-responses -- <experiment-dir>');
      process.exit(1);
    }
  }

  if (!experimentDir) {
    console.error('No experiment directory found');
    process.exit(1);
  }

  // API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY required for embedding');
    process.exit(1);
  }

  // Load embedding model configs
  const configRaw = await readFile('config/models-config.json', 'utf-8');
  const config = JSON.parse(configRaw);
  let embeddingModels: EmbeddingModelConfig[] = config.embedding_models ?? [];

  if (embeddingModels.length === 0) {
    console.error('No embedding_models configured in config/models-config.json');
    process.exit(1);
  }

  // Filter to specific embedder if requested
  const embedderIdx = args.indexOf('--embedder');
  if (embedderIdx !== -1 && args[embedderIdx + 1]) {
    const filterId = args[embedderIdx + 1];
    embeddingModels = embeddingModels.filter((m) => m.id === filterId);
    if (embeddingModels.length === 0) {
      console.error(`Embedder "${filterId}" not found in config`);
      process.exit(1);
    }
  }

  // Parse max concurrent
  const concurrentIdx = args.indexOf('--max-concurrent');
  const maxConcurrent = concurrentIdx !== -1 ? parseInt(args[concurrentIdx + 1], 10) : 5;

  console.log(`Embedding with ${embeddingModels.length} model(s):`);
  for (const m of embeddingModels) {
    console.log(`  ${m.name} (${m.id}) ${m.is_neutral ? '[neutral]' : `[sibling: ${m.sibling_provider}]`}`);
  }

  // Run embedding
  const client = new EmbeddingClient({ apiKey });
  await client.embedExperiment(experimentDir, embeddingModels, { maxConcurrent });

  // Run drift analysis
  console.log('\nRunning drift analysis...');
  const { driftAnalyses, embedderAgreements } =
    await DriftAnalyzer.analyzeExperiment(experimentDir);

  if (driftAnalyses.length > 0) {
    DriftAnalyzer.printSummary(driftAnalyses, embedderAgreements);
  } else {
    console.log('No drift analyses produced (need civilian-baseline runs for comparison)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
