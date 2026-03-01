#!/usr/bin/env node
/**
 * Generate Profiles
 * 
 * Standalone script to generate and inspect profiles without running probes.
 * Useful for iterating on profile quality before committing to full runs.
 * 
 * Usage:
 *   npm run generate-profile
 *   npm run generate-profile -- --archetype urban-infrastructure
 *   npm run generate-profile -- --generator anthropic/claude-sonnet-4-5-20250929
 */

import { config } from 'dotenv';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { OpenRouterClient } from '../src/openrouter-client.js';
import { ProfileGenerator } from '../src/profile-generator.js';
import type { ModelConfig, ProfileArchetype, ConditionId } from '../src/types.js';

config({ path: 'config/.env' });

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      options[args[i].replace('--', '')] = args[i + 1] || '';
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    console.error('Error: OPENROUTER_API_KEY not configured');
    process.exit(1);
  }

  const configContent = await readFile('config/models-config.json', 'utf-8');
  const modelsConfig = JSON.parse(configContent);

  // Select generator
  let generators: ModelConfig[] = modelsConfig.generator_models;
  if (options.generator) {
    generators = generators.filter((m: ModelConfig) => m.id === options.generator);
  }
  if (generators.length === 0) {
    console.error('No matching generator model found');
    process.exit(1);
  }

  // Select archetype
  let archetypes: ProfileArchetype[] = modelsConfig.archetypes;
  if (options.archetype) {
    archetypes = archetypes.filter((a: ProfileArchetype) => a.id === options.archetype);
  }
  if (archetypes.length === 0) {
    console.error('No matching archetype found');
    process.exit(1);
  }

  const conditions: ConditionId[] = [
    'civilian-baseline',
    'corporate-authority',
    'government-authority',
    'military-authority',
  ];

  const client = new OpenRouterClient({
    apiKey,
    siteUrl: process.env.SITE_URL,
    siteName: process.env.SITE_NAME,
  });

  const generator = new ProfileGenerator(client);

  const outputDir = 'profiles/generated';
  await mkdir(outputDir, { recursive: true });

  for (const archetype of archetypes) {
    for (const genModel of generators) {
      const runId = `manual-${Date.now()}`;

      console.log(`\nGenerating profile set:`);
      console.log(`  Archetype: ${archetype.id}`);
      console.log(`  Generator: ${genModel.name}`);
      console.log(`  Conditions: ${conditions.join(', ')}`);

      const profiles = await generator.generateProfileSet(archetype, conditions, genModel, runId);

      for (const [condition, profile] of profiles) {
        const filename = `${archetype.id}-${condition}-${genModel.id.replace(/\//g, '-')}.json`;
        const filepath = join(outputDir, filename);
        await writeFile(filepath, JSON.stringify(profile, null, 2), 'utf-8');
        console.log(`  ✓ Saved: ${filepath}`);
      }
    }
  }

  console.log('\n✓ Profile generation complete. Inspect profiles/ directory.');
}

main();
