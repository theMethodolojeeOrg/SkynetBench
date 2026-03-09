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
 *   --subject MODEL_ID         Use specific subject model (default: first in config)
 *   --generator MODEL_ID       Use specific generator model (default: first in config)
 *   --scorer-model MODEL_ID    Use model for scoring (default: heuristic)
 *   --skip-embedding           Skip the embedding stage
 *   --skip-scoring             Skip scoring (just run experiment)
 *   --skip-analysis            Skip analysis stage
 *   --runs N                   Runs per combination (default: 5)
 *   --archetypes id1,id2       Archetypes to use (default: all in config)
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

/** Extract provider from model ID (e.g. "anthropic/claude-sonnet-4-6" → "anthropic") */
function inferProvider(modelId: string): string {
  return modelId.split('/')[0] ?? 'unknown';
}

/** Cross-provider scoring matrix: given a subject provider, return the preferred scorer provider */
const SCORER_MATRIX: Record<string, string[]> = {
  'anthropic': ['openai', 'google'],
  'openai': ['anthropic', 'google'],
  'google': ['openai', 'anthropic'],
  'xai': ['openai', 'anthropic'],
  'zhipu': ['openai', 'anthropic'],
  'meta': ['openai', 'anthropic'],
};

/**
 * Auto-select a cross-provider scorer for the given subject models.
 * Finds a scorer from the config whose provider doesn't match ANY subject's provider.
 */
function autoSelectScorer(
  subjectModels: ModelConfig[],
  scorerModels: ModelConfig[],
): ModelConfig | undefined {
  const subjectProviders = new Set(
    subjectModels.map((m) => m.provider ?? inferProvider(m.id))
  );

  // Find a scorer whose provider doesn't conflict with any subject
  for (const scorer of scorerModels) {
    const scorerProvider = scorer.provider ?? inferProvider(scorer.id);
    if (!subjectProviders.has(scorerProvider)) {
      return scorer;
    }
  }

  // If all scorers conflict (unlikely), try the matrix to find a preferred order
  const firstSubjectProvider = subjectModels[0]?.provider ?? inferProvider(subjectModels[0]?.id ?? '');
  const preferred = SCORER_MATRIX[firstSubjectProvider] ?? ['openai', 'anthropic'];
  for (const pref of preferred) {
    const scorer = scorerModels.find(
      (m) => (m.provider ?? inferProvider(m.id)) === pref
    );
    if (scorer) return scorer;
  }

  return undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = hasFlag(args, '--dry-run');
  const skipEmbedding = hasFlag(args, '--skip-embedding');
  const skipScoring = hasFlag(args, '--skip-scoring');
  const skipAnalysis = hasFlag(args, '--skip-analysis');
  const scorerModelId = getFlagValue(args, '--scorer-model');
  const subjectModelId = getFlagValue(args, '--subject');
  const generatorModelId = getFlagValue(args, '--generator');
  const customExperimentId = getFlagValue(args, '--experiment-id');
  const runsOverride = getFlagValue(args, '--runs');
  const archetypesFilter = getFlagValue(args, '--archetypes');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  // Load config
  const configRaw = await readFile('config/models-config.json', 'utf-8');
  const config = JSON.parse(configRaw);

  // Resolve subject model(s)
  let subjectModels: ModelConfig[];
  if (subjectModelId) {
    const found = config.subject_models.find(
      (m: ModelConfig) => m.id === subjectModelId
    );
    if (found) {
      subjectModels = [found];
    } else {
      // Build a minimal ModelConfig for an ad-hoc model ID
      subjectModels = [{
        id: subjectModelId,
        name: subjectModelId,
        role: ['subject'] as ModelConfig['role'],
        provider: inferProvider(subjectModelId),
        contextLength: 128000,
        samplingParams: { temperature: 0.7, top_p: 0.9, max_tokens: 4096 },
        subjectParams: { temperature: 0.7, top_p: 0.9, max_tokens: 4096 },
      }];
      console.log(`Using ad-hoc subject model: ${subjectModelId}`);
    }
  } else {
    subjectModels = config.subject_models;
  }

  // Resolve generator model
  let generatorModels: ModelConfig[];
  if (generatorModelId) {
    const found = config.generator_models.find(
      (m: ModelConfig) => m.id === generatorModelId
    );
    if (found) {
      generatorModels = [found];
    } else {
      generatorModels = [{
        id: generatorModelId,
        name: generatorModelId,
        role: ['generator'] as ModelConfig['role'],
        provider: inferProvider(generatorModelId),
        contextLength: 128000,
        samplingParams: { temperature: 0.7, top_p: 0.9, max_tokens: 4000 },
        generatorParams: { temperature: 0.8, top_p: 0.95, max_tokens: 8000 },
      }];
      console.log(`Using ad-hoc generator model: ${generatorModelId}`);
    }
  } else {
    generatorModels = config.generator_models.slice(0, 1);
  }

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

  let probeIds = allProbeIds.filter((id) => id !== 'follow-up-pressure');

  if (isDryRun) {
    console.log('\n=== DRY RUN MODE ===');
    console.log('Using: 1 probe, 1 model, 1 run per combination\n');
    subjectModels = [subjectModels[0]];
    probeIds = [probeIds[0]];
  }

  // Filter archetypes if specified
  let archetypes = config.archetypes;
  if (archetypesFilter) {
    const ids = archetypesFilter.split(',');
    archetypes = archetypes.filter((a: any) => ids.includes(a.id));
  }

  const experimentConfig: ExperimentConfig = {
    experiment_id: experimentId,
    generator_models: generatorModels,
    subject_models: subjectModels,
    conditions,
    probe_ids: probeIds,
    archetypes,
    runs_per_combination: isDryRun ? 1 : (runsOverride ? parseInt(runsOverride, 10) : 5),
    max_concurrent: isDryRun ? 1 : 3,
    retry_attempts: 3,
    retry_delay_ms: 1000,
    include_follow_up: !isDryRun,
  };

  const totalRuns =
    experimentConfig.archetypes.length *
    experimentConfig.probe_ids.length *
    experimentConfig.subject_models.length *
    experimentConfig.conditions.length *
    experimentConfig.runs_per_combination;

  console.log(`Experiment: ${experimentId}`);
  console.log(`  Generator: ${generatorModels.map((m) => m.name).join(', ')}`);
  console.log(`  Subjects: ${subjectModels.map((m) => m.name).join(', ')}`);
  console.log(`  Archetypes: ${experimentConfig.archetypes.map((a) => a.id).join(', ')}`);
  console.log(`  Probes: ${experimentConfig.probe_ids.length}`);
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
      // Explicit scorer specified via --scorer-model flag
      scorerModel = (config.scorer_models ?? []).find(
        (m: ModelConfig) => m.id === scorerModelId
      ) ?? {
        id: scorerModelId,
        name: scorerModelId,
        role: ['scorer'] as ModelConfig['role'],
        provider: inferProvider(scorerModelId),
        contextLength: 128000,
        samplingParams: { temperature: 0.3, top_p: 1, max_tokens: 2048 },
        scorerParams: { temperature: 0.3, top_p: 1, max_tokens: 2048 },
      };
    } else if ((config.scorer_models ?? []).length > 0) {
      // Auto-select cross-provider scorer
      scorerModel = autoSelectScorer(subjectModels, config.scorer_models);
      if (scorerModel) {
        console.log(`Auto-selected cross-provider scorer: ${scorerModel.name}`);
      }
    }

    if (scorerModel) {
      // Cross-provider validation
      const scorerProvider = scorerModel.provider ?? inferProvider(scorerModel.id);
      const conflicting = subjectModels.filter(
        (m) => (m.provider ?? inferProvider(m.id)) === scorerProvider
      );
      if (conflicting.length > 0) {
        console.warn(
          `⚠ CROSS-PROVIDER WARNING: Scorer (${scorerModel.id}) shares provider ` +
          `"${scorerProvider}" with subject model(s): ${conflicting.map((m) => m.id).join(', ')}. ` +
          `This may introduce measurement bias. Consider using a scorer from a different provider.`
        );
      }
      console.log(`Using model scorer: ${scorerModel.name}`);
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

    const { readdir: rd } = await import('fs/promises');
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
