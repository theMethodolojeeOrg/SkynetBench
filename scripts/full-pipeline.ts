/**
 * Full Pipeline — CLI Entry Point
 *
 * Runs the complete SkynetBench pipeline:
 * 1. Run experiment (probe subjects across conditions)
 * 2. Score responses (rubric-based evaluation)
 * 3. Embed responses (multi-embedder vector measurement)
 * 4. Analyze results (integrated rubric + embedding analysis)
 *
 * Each stage also works independently via its own CLI script.
 *
 * Usage:
 *   npm run full-pipeline -- [options]
 *
 * Options:
 *   --experiment-id ID         Custom experiment ID (default: auto-generated timestamp)
 *   --scorer-model MODEL_ID    Use model for scoring (default: heuristic)
 *   --skip-embedding           Skip the embedding stage
 *   --skip-scoring             Skip scoring (just run experiment)
 *   --skip-analysis            Skip analysis stage
 *   --dry-run                  Run with minimal config (1 probe, 1 model, 1 run)
 */

import { config as dotenvConfig } from 'dotenv';
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { OpenRouterClient } from '../src/openrouter-client.js';
import { ExperimentRunner } from '../src/runner.js';
import { ResponseScorer } from '../src/scorer.js';
import { EmbeddingClient } from '../src/embedder.js';
import { DriftAnalyzer } from '../src/drift-analyzer.js';
import { ProbeLoader } from '../src/probe-loader.js';
import type {
  ModelConfig,
  ExperimentConfig,
  EmbeddingModelConfig,
  ConditionId,
} from '../src/types.js';

dotenvConfig();

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = hasFlag(args, '--dry-run');
  const skipEmbedding = hasFlag(args, '--skip-embedding');
  const skipScoring = hasFlag(args, '--skip-scoring');
  const skipAnalysis = hasFlag(args, '--skip-analysis');
  const scorerModelId = getFlagValue(args, '--scorer-model');
  const customExperimentId = getFlagValue(args, '--experiment-id');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  // Load config
  const configRaw = await readFile('config/models-config.json', 'utf-8');
  const config = JSON.parse(configRaw);

  // Load probes and conditions
  const probeLoader = new ProbeLoader();
  const allProbeIds = await probeLoader.listProbeIds();

  const conditionFiles = await readdir('conditions');
  const conditions: ConditionId[] = conditionFiles
    .filter((f) => f.endsWith('.json'))
    .map((f) => basename(f, '.json') as ConditionId);

  // Build experiment config
  const experimentId =
    customExperimentId ??
    `exp-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  let subjectModels: ModelConfig[] = config.subject_models;
  let probeIds = allProbeIds.filter((id) => id !== 'follow-up-pressure');

  if (isDryRun) {
    console.log('\n=== DRY RUN MODE ===');
    console.log('Using: 1 probe, 1 model, 1 run per combination\n');
    subjectModels = [subjectModels[0]];
    probeIds = [probeIds[0]];
  }

  const experimentConfig: ExperimentConfig = {
    experiment_id: experimentId,
    generator_models: config.generator_models.slice(0, 1),
    subject_models: subjectModels,
    conditions,
    probe_ids: probeIds,
    archetypes: config.archetypes.slice(0, 1),
    runs_per_combination: isDryRun ? 1 : 1,
    max_concurrent: isDryRun ? 1 : 3,
    retry_attempts: 3,
    retry_delay_ms: 1000,
    include_follow_up: false,
  };

  const totalRuns =
    experimentConfig.probe_ids.length *
    experimentConfig.subject_models.length *
    experimentConfig.conditions.length *
    experimentConfig.runs_per_combination;

  console.log(`Experiment: ${experimentId}`);
  console.log(`  Probes: ${experimentConfig.probe_ids.length}`);
  console.log(`  Models: ${experimentConfig.subject_models.length}`);
  console.log(`  Conditions: ${experimentConfig.conditions.length}`);
  console.log(`  Total runs: ${totalRuns}`);
  console.log('');

  // ── Stage 1: Run Experiment ──────────────────────────────────────────────
  console.log('═══ STAGE 1: RUN EXPERIMENT ═══\n');

  const runner = new ExperimentRunner(
    apiKey,
    experimentConfig,
    undefined,
    undefined,
    'SkynetBench'
  );

  await runner.run();
  const experimentDir = `results/raw-responses/${experimentId}`;
  console.log(`\nExperiment complete -> ${experimentDir}\n`);

  // ── Stage 2: Score Responses ─────────────────────────────────────────────
  if (!skipScoring) {
    console.log('═══ STAGE 2: SCORE RESPONSES ═══\n');

    let scorerModel: ModelConfig | undefined;
    if (scorerModelId) {
      scorerModel = {
        id: scorerModelId,
        name: scorerModelId,
        role: ['scorer'],
        contextLength: 128000,
        samplingParams: { temperature: 0.1, top_p: 1, max_tokens: 3000 },
        scorerParams: { temperature: 0.1, top_p: 1, max_tokens: 3000 },
      };
      console.log(`Using model scorer: ${scorerModelId}`);
    } else {
      console.log('Using heuristic scorer');
    }

    const scorerClient = scorerModel
      ? new OpenRouterClient({ apiKey, siteName: 'SkynetBench' })
      : undefined;
    const scorer = new ResponseScorer(scorerClient, scorerModel);
    await scorer.scoreExperiment(experimentDir);
    console.log('');
  }

  // ── Stage 3: Embed Responses ─────────────────────────────────────────────
  if (!skipEmbedding) {
    console.log('═══ STAGE 3: EMBED RESPONSES ═══\n');

    const embeddingModels: EmbeddingModelConfig[] =
      config.embedding_models ?? [];

    if (embeddingModels.length > 0) {
      const embedClient = new EmbeddingClient({ apiKey });
      await embedClient.embedExperiment(experimentDir, embeddingModels);

      console.log('\nRunning drift analysis...');
      const { driftAnalyses, embedderAgreements } =
        await DriftAnalyzer.analyzeExperiment(experimentDir);

      if (driftAnalyses.length > 0) {
        DriftAnalyzer.printSummary(driftAnalyses, embedderAgreements);
      }
    } else {
      console.log('No embedding models configured — skipping');
    }
    console.log('');
  }

  // ── Stage 4: Analyze Results ─────────────────────────────────────────────
  if (!skipScoring && !skipAnalysis) {
    console.log('═══ STAGE 4: ANALYZE RESULTS ═══\n');

    // Import and run the analysis (reuse the analyze-results logic)
    const { readdir: rd, readFile: rf, writeFile: wf, mkdir: mkd } =
      await import('fs/promises');
    const scoredDir = join(experimentDir, 'scored');

    try {
      const files = await rd(scoredDir);
      const jsonFiles = files.filter((f) => f.endsWith('.scored.json'));

      if (jsonFiles.length > 0) {
        console.log(`Found ${jsonFiles.length} scored runs`);
        console.log(
          'Run "npm run analyze" for full analysis with report generation.'
        );
      } else {
        console.log('No scored runs found — skipping analysis');
      }
    } catch {
      console.log('Scored directory not found — skipping analysis');
    }
  }

  console.log('\n═══ PIPELINE COMPLETE ═══');
  console.log(`Experiment directory: ${experimentDir}`);
  console.log('\nNext steps:');
  if (skipScoring) console.log('  npm run score-responses');
  if (skipEmbedding) console.log('  npm run embed-responses');
  console.log('  npm run analyze');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
