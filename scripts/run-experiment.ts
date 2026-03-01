/**
 * Run Experiment — CLI Entry Point
 * 
 * Usage:
 *   npm run run-experiment -- [options]
 * 
 * Options:
 *   --subjects model1,model2     Subject models (default: all in config)
 *   --generators model1,model2   Generator models (default: all in config)
 *   --archetypes id1,id2         Archetypes (default: all in config)
 *   --probes id1,id2             Probes (default: all)
 *   --conditions id1,id2         Conditions (default: all)
 *   --runs N                     Runs per combination (default: 1)
 *   --no-followup                Disable follow-up pressure probes
 *   --experiment-id ID           Custom experiment ID
 * 
 * Environment Provider Options:
 *   --env-from-stdin             Load provider config from stdin
 *   --env-from-env               Load provider config from SKYNET_ENV_CONFIG env var
 *   --env-callback URL           Load provider config from HTTPS callback
 *   --env-callback-auth TOKEN    Authorization header for callback
 *   --env-file PATH              Load from file (DEVELOPMENT ONLY)
 */

import { readFile } from 'fs/promises';
import { config as dotenvConfig } from 'dotenv';
import { ExperimentRunner } from '../src/runner.js';
import { EphemeralConfigLoader, IngestionMethod } from '../src/config-loader.js';
import { ConfigurableEnvironmentProvider } from '../src/configurable-provider.js';
import { GenericEnvironmentProvider } from '../src/generic-provider.js';
import type { EnvironmentSurfaceProvider } from '../src/environment-provider.js';
import type { ExperimentConfig, ModelConfig, ProfileArchetype, ConditionId } from '../src/types.js';

dotenvConfig();

async function main() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args);

  // Load base config
  const modelsConfig = JSON.parse(
    await readFile('config/models-config.json', 'utf-8')
  );

  // Filter models
  let subjectModels: ModelConfig[] = modelsConfig.subject_models;
  if (flags.subjects) {
    const ids = flags.subjects.split(',');
    subjectModels = subjectModels.filter((m: ModelConfig) =>
      ids.some((id: string) => m.id.includes(id) || m.name.toLowerCase().includes(id.toLowerCase()))
    );
  }

  let generatorModels: ModelConfig[] = modelsConfig.generator_models;
  if (flags.generators) {
    const ids = flags.generators.split(',');
    generatorModels = generatorModels.filter((m: ModelConfig) =>
      ids.some((id: string) => m.id.includes(id) || m.name.toLowerCase().includes(id.toLowerCase()))
    );
  }

  // Filter archetypes
  let archetypes: ProfileArchetype[] = modelsConfig.archetypes;
  if (flags.archetypes) {
    const ids = flags.archetypes.split(',');
    archetypes = archetypes.filter((a: ProfileArchetype) => ids.includes(a.id));
  }

  // Conditions
  const conditions: ConditionId[] = flags.conditions
    ? flags.conditions.split(',') as ConditionId[]
    : ['civilian-baseline', 'corporate-authority', 'government-authority', 'military-authority'];

  // Probes
  const probeIds: string[] = flags.probes
    ? flags.probes.split(',')
    : ['surveillance-normalization', 'data-boundary-erosion', 'accountability-diffusion',
       'ethical-override-escalation', 'institutional-capture'];

  // ── Load Environment Provider ──────────────────────────────────────────────
  let provider: EnvironmentSurfaceProvider;

  if (flags['env-from-stdin']) {
    console.log('Loading environment config from stdin...');
    const config = await EphemeralConfigLoader.load('stdin');
    provider = new ConfigurableEnvironmentProvider(config);
  } else if (flags['env-from-env']) {
    console.log('Loading environment config from SKYNET_ENV_CONFIG...');
    const config = await EphemeralConfigLoader.load('env');
    provider = new ConfigurableEnvironmentProvider(config);
  } else if (flags['env-callback']) {
    console.log(`Loading environment config from ${flags['env-callback']}...`);
    const config = await EphemeralConfigLoader.load('callback', {
      callback: {
        url: flags['env-callback'],
        authorization: flags['env-callback-auth'],
      },
    });
    provider = new ConfigurableEnvironmentProvider(config);
  } else if (flags['env-file']) {
    const config = await EphemeralConfigLoader.load('file-dev-only', {
      dev_file_path: flags['env-file'],
    });
    provider = new ConfigurableEnvironmentProvider(config);
  } else {
    provider = new GenericEnvironmentProvider();
  }

  // ── Build Experiment Config ────────────────────────────────────────────────
  const experimentId = flags['experiment-id'] ||
    `skynet-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  const experimentConfig: ExperimentConfig = {
    experiment_id: experimentId,
    archetypes,
    conditions,
    probe_ids: probeIds,
    generator_models: generatorModels,
    subject_models: subjectModels,
    runs_per_combination: parseInt(flags.runs || '1', 10),
    include_follow_up: !flags['no-followup'],
    retry_attempts: 3,
    retry_delay_ms: 2000,
  };

  // ── Validate ───────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY not set. Copy config/.env.example to .env');
    process.exit(1);
  }

  if (subjectModels.length === 0) {
    console.error('Error: No subject models matched filter');
    process.exit(1);
  }
  if (generatorModels.length === 0) {
    console.error('Error: No generator models matched filter');
    process.exit(1);
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  const runner = new ExperimentRunner(
    apiKey,
    experimentConfig,
    provider,
    process.env.SITE_URL,
    process.env.SITE_NAME
  );

  await runner.run();
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      // Boolean flags (no value)
      if (key === 'no-followup' || key === 'env-from-stdin' || key === 'env-from-env') {
        flags[key] = 'true';
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = 'true';
      }
    }
  }
  return flags;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
