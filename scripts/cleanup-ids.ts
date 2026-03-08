/**
 * One-time cleanup script to remove redundant experiment-id + archetype
 * from profile_ids, run_ids, and filenames throughout the Phase 1 dataset.
 *
 * Bug: profile-generator.ts composed profile_id as:
 *   `${archetype.id}-${condition}-${runId}`
 * where runId already contained `${experiment_id}-${archetype.id}-${generator}`,
 * producing IDs like:
 *   urban-infrastructure-civilian-baseline-phase1-full-comparative-urban-infrastructure-openai-gpt-4o
 * instead of:
 *   urban-infrastructure-civilian-baseline-openai-gpt-4o
 *
 * This script removes the redundant middle section from all IDs and filenames.
 */

import { readdir, readFile, writeFile, rename, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';

const REDUNDANT = 'phase1-full-comparative-urban-infrastructure-';
const DRY_RUN = process.argv.includes('--dry-run');

let filesModified = 0;
let filesRenamed = 0;
let idsFixed = 0;

async function cleanJsonContent(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath, 'utf-8');
  if (!raw.includes(REDUNDANT)) return false;

  const cleaned = raw.replaceAll(REDUNDANT, '');
  if (cleaned === raw) return false;

  const occurrences = (raw.match(new RegExp(REDUNDANT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  idsFixed += occurrences;

  if (!DRY_RUN) {
    await writeFile(filePath, cleaned, 'utf-8');
  }
  return true;
}

async function processDirectory(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  // First pass: process file contents
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);

    if (s.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.endsWith('.json')) {
      const modified = await cleanJsonContent(fullPath);
      if (modified) {
        filesModified++;
        if (DRY_RUN) console.log(`  [content] ${fullPath}`);
      }
    }
  }

  // Second pass: rename files (after content is fixed)
  const entriesAfter = await readdir(dir);
  for (const entry of entriesAfter) {
    if (entry.includes(REDUNDANT)) {
      const newName = entry.replaceAll(REDUNDANT, '');
      const oldPath = join(dir, entry);
      const newPath = join(dir, newName);

      if (DRY_RUN) {
        console.log(`  [rename] ${entry} → ${newName}`);
      } else {
        await rename(oldPath, newPath);
      }
      filesRenamed++;
    }
  }
}

async function main() {
  const experimentDir = process.argv[2] ||
    join(process.cwd(), 'results/raw-responses/phase1-full-comparative');

  console.log(`Cleanup: removing "${REDUNDANT}" from IDs and filenames`);
  console.log(`Experiment dir: ${experimentDir}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // Process all subdirectories
  const dirs = ['profiles', 'runs', 'scored', 'embeddings'];
  for (const sub of dirs) {
    const subDir = join(experimentDir, sub);
    console.log(`Processing ${sub}/...`);
    await processDirectory(subDir);
  }

  // Process manifest.json at top level
  const manifestPath = join(experimentDir, 'manifest.json');
  try {
    const modified = await cleanJsonContent(manifestPath);
    if (modified) {
      filesModified++;
      if (DRY_RUN) console.log(`  [content] manifest.json`);
    }
  } catch { /* no manifest */ }

  // Process analyzed results
  const analyzedDir = join(process.cwd(), 'results/analyzed/phase1-full-comparative');
  console.log(`Processing analyzed/...`);
  await processDirectory(analyzedDir);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Files with content modified: ${filesModified}`);
  console.log(`  Files renamed: ${filesRenamed}`);
  console.log(`  Total ID occurrences fixed: ${idsFixed}`);
  console.log(`${'═'.repeat(50)}`);

  if (DRY_RUN) {
    console.log('\nDry run complete. Run without --dry-run to apply changes.');
  } else {
    console.log('\nCleanup complete.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
