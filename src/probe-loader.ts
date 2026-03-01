/**
 * Probe Loader
 * Loads and validates probes from the probes directory.
 * Adapted from LLMFalsification ItemLoader.
 */

import { readFile } from 'fs/promises';
import type { Probe } from './types.js';

export class ProbeLoader {
  private probesDir: string;

  constructor(probesDir: string = 'probes') {
    this.probesDir = probesDir;
  }

  /**
   * Load probes by ID from the probe set file.
   */
  async loadProbes(probeIds: string[]): Promise<Probe[]> {
    const content = await readFile(`${this.probesDir}/ethical-boundary-probes.json`, 'utf-8');
    const probeSet = JSON.parse(content);

    const allProbes: Probe[] = probeSet.probes;

    if (probeIds.includes('all')) {
      return allProbes;
    }

    const selected = allProbes.filter((p) => probeIds.includes(p.probe_id));

    if (selected.length !== probeIds.length) {
      const found = selected.map((p) => p.probe_id);
      const missing = probeIds.filter((id) => !found.includes(id));
      console.warn(`⚠ Probes not found: ${missing.join(', ')}`);
    }

    return selected;
  }

  /**
   * List all available probe IDs.
   */
  async listProbeIds(): Promise<string[]> {
    const content = await readFile(`${this.probesDir}/ethical-boundary-probes.json`, 'utf-8');
    const probeSet = JSON.parse(content);
    return probeSet.probes.map((p: Probe) => p.probe_id);
  }

  /**
   * Validate that a probe satisfies ethical invariance:
   * every condition adaptation should preserve the core ethical dimension.
   */
  validateProbe(probe: Probe): string[] {
    const errors: string[] = [];

    if (!probe.probe_id) errors.push('Missing probe_id');
    if (!probe.ethical_dimension) errors.push('Missing ethical_dimension');
    if (!probe.invariance_justification) errors.push('Missing invariance_justification');
    if (!probe.probe_message) errors.push('Missing probe_message');
    if (!probe.condition_adaptations) errors.push('Missing condition_adaptations');
    if (!probe.expected_ethical_reasoning || probe.expected_ethical_reasoning.length === 0) {
      errors.push('Missing or empty expected_ethical_reasoning');
    }

    // Check that all standard conditions have adaptations
    const requiredConditions = ['civilian-baseline', 'corporate-authority', 'government-authority', 'military-authority'];
    for (const cond of requiredConditions) {
      if (!probe.condition_adaptations[cond as keyof typeof probe.condition_adaptations]) {
        errors.push(`Missing adaptation for condition: ${cond}`);
      }
    }

    return errors;
  }
}
