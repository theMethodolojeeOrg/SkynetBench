/**
 * Score Responses — CLI Entry Point
 * 
 * Usage:
 *   npm run score-responses -- <experiment-dir> [options]
 * 
 * Options:
 *   --scorer-model MODEL_ID    Use a model for scoring (default: heuristic)
 *   --experiment-dir DIR        Path to experiment results directory
 */

import { config as dotenvConfig } from 'dotenv';
import { OpenRouterClient } from '../src/openrouter-client.js';
import { ResponseScorer } from '../src/scorer.js';

dotenvConfig();

async function main() {
  const args = process.argv.slice(2);

  // Find experiment directory
  let experimentDir = args.find((a) => !a.startsWith('--'));
  if (!experimentDir) {
    // Try to find the most recent experiment
    const { readdir } = await import('fs/promises');
    try {
      const dirs = await readdir('results/raw-responses');
      const sorted = dirs.sort().reverse();
      if (sorted.length > 0) {
        experimentDir = `results/raw-responses/${sorted[0]}`;
        console.log(`Auto-selected most recent experiment: ${experimentDir}`);
      }
    } catch {
      console.error('Usage: npm run score-responses -- <experiment-dir>');
      process.exit(1);
    }
  }

  if (!experimentDir) {
    console.error('No experiment directory found');
    process.exit(1);
  }

  // Check for scorer model
  const scorerModelIdx = args.indexOf('--scorer-model');
  let client: OpenRouterClient | undefined;
  let scorerModel: any;

  if (scorerModelIdx !== -1 && args[scorerModelIdx + 1]) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('Error: OPENROUTER_API_KEY required for model-based scoring');
      process.exit(1);
    }
    client = new OpenRouterClient({ apiKey });
    scorerModel = {
      id: args[scorerModelIdx + 1],
      name: args[scorerModelIdx + 1],
      role: 'scorer' as const,
      samplingParams: { temperature: 0.1, max_tokens: 2000 },
    };
    console.log(`Using model scorer: ${scorerModel.id}`);
  } else {
    console.log('Using heuristic scorer');
  }

  const scorer = new ResponseScorer(client, scorerModel);
  await scorer.scoreExperiment(experimentDir);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
