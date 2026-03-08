/**
 * Context Composer (v2 — Environment Provider Integration)
 * 
 * Takes a UserProfile, a Condition, and a Probe and assembles the complete
 * context that gets sent to the SUBJECT model via OpenRouter.
 * 
 * When an EnvironmentSurfaceProvider is available, delegates system prompt,
 * memory format, and tool manifest generation to the provider. Otherwise
 * falls back to the built-in composition logic.
 * 
 * This is where the self-consistent environment actually gets built.
 */

import { readFile } from 'fs/promises';
import type {
  UserProfile,
  ConditionId,
  Probe,
  OpenRouterMessage,
} from './types.js';
import type {
  EnvironmentSurfaceProvider,
  ToolDefinition,
} from './environment-provider.js';

export interface ComposedContext {
  system_prompt: string;
  memory_block: string;
  probe_message: string;
  /** Tool definitions the model should see (empty if no provider or no tools) */
  tool_manifest: ToolDefinition[];
  /** The full message array ready for OpenRouter */
  messages: OpenRouterMessage[];
  /** Provider ID (for result logging) or 'none' */
  environment_provider_id: string;
}

export class ContextComposer {
  private provider: EnvironmentSurfaceProvider | null;

  constructor(provider?: EnvironmentSurfaceProvider) {
    this.provider = provider ?? null;
  }

  /**
   * Compose the full context for a single evaluation run.
   */
  async compose(
    profile: UserProfile,
    conditionId: ConditionId,
    probe: Probe
  ): Promise<ComposedContext> {
    const condition = await this.loadCondition(conditionId);

    // Delegate to provider if available, otherwise built-in
    const systemPrompt = this.provider
      ? this.provider.getSystemPrompt(profile, conditionId)
      : this.buildSystemPrompt(profile, condition);

    const memoryBlock = this.provider
      ? this.provider.getMemoryBlock(profile, conditionId)
      : this.buildMemoryBlock(profile);

    const toolManifest = this.provider
      ? this.provider.getToolManifest(conditionId)
      : [];

    // Probe message is always our responsibility (it's the independent variable)
    const probeMessage = this.buildProbeMessage(probe, conditionId, condition);

    // Assemble into OpenRouter messages
    // Memory injection format depends on provider
    const systemContent = memoryBlock
      ? `${systemPrompt}\n\n<user_memory>\n${memoryBlock}\n</user_memory>`
      : systemPrompt;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: probeMessage },
    ];

    return {
      system_prompt: systemPrompt,
      memory_block: memoryBlock,
      probe_message: probeMessage,
      tool_manifest: toolManifest,
      messages,
      environment_provider_id: this.provider?.getProviderId() ?? 'none',
    };
  }

  /**
   * Built-in system prompt composition (no provider).
   */
  private buildSystemPrompt(profile: UserProfile, condition: any): string {
    const p = profile.identity;

    let template: string =
      condition?.layers?.system_prompt?.content_template ||
      `You are assisting ${p.name}, a ${p.profession.title} at ${p.profession.organization_name}.`;

    template = template
      .replace(/\{\{name\}\}/g, p.name)
      .replace(/\{\{title\}\}/g, p.profession.title)
      .replace(/\{\{organization_name\}\}/g, p.profession.organization_name)
      .replace(/\{\{organization_type\}\}/g, p.profession.organization_type)
      .replace(/\{\{clearance_level\}\}/g, p.profession.clearance_level || 'none')
      .replace(/\{\{domain_expertise\}\}/g, p.domain_expertise.join(', '))
      .replace(
        /\{\{account_age_months\}\}/g,
        String(Math.round(profile.metadata_envelope.account_age_weeks / 4))
      );

    const directives = profile.interaction_style.behavioral_directives;
    if (directives.length > 0) {
      template += `\n\n${p.name} has previously asked you to:\n`;
      directives.forEach((d) => {
        template += `- ${d.directive}\n`;
      });
    }

    const fmtRules = profile.interaction_style.formatting_preferences.formatting_rules;
    if (fmtRules.length > 0) {
      template += `\nFormatting preferences:\n`;
      fmtRules.forEach((r) => {
        template += `- ${r}\n`;
      });
    }

    return template;
  }

  /**
   * Built-in memory block (no provider).
   */
  private buildMemoryBlock(profile: UserProfile): string {
    const entries = [...profile.memory_entries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return entries.map((e) => `[${e.date}] ${e.content}`).join('\n');
  }

  /**
   * Build the probe message with condition-specific adaptations.
   * This is ALWAYS our responsibility — probes are the measurement instrument.
   */
  private buildProbeMessage(probe: Probe, conditionId: ConditionId, condition: any): string {
    let message = probe.probe_message ?? '';

    if (probe.condition_adaptations) {
      const adaptations = probe.condition_adaptations[conditionId];
      if (adaptations) {
        for (const [key, value] of Object.entries(adaptations)) {
          if (value) {
            message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          }
        }
      }
    }

    const vocab = condition?.layers?.vocabulary_saturation?.vocabulary_replacements;
    if (vocab) {
      for (const [key, value] of Object.entries(vocab)) {
        message = message.replace(
          new RegExp(`\\{\\{vocabulary\\.${key}\\}\\}`, 'g'),
          value as string
        );
      }
    }

    return message;
  }

  private async loadCondition(conditionId: ConditionId): Promise<any> {
    try {
      const content = await readFile(`conditions/${conditionId}.json`, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * For follow-up pressure probes: compose a second turn after initial response.
   */
  composeFollowUp(
    originalContext: ComposedContext,
    originalResponse: string,
    probe: Probe,
    conditionId: ConditionId
  ): OpenRouterMessage[] {
    const followUpVariants = probe.probe_message_variants;
    if (!followUpVariants) {
      throw new Error(`Probe ${probe.probe_id} has no follow-up variants`);
    }

    const variantKey = conditionId.includes('military')
      ? 'military'
      : conditionId.includes('government')
        ? 'government'
        : conditionId.includes('corporate')
          ? 'corporate'
          : 'civilian';

    const followUpMessage = followUpVariants[variantKey];
    if (!followUpMessage) {
      throw new Error(`No follow-up variant for condition: ${conditionId}`);
    }

    return [
      ...originalContext.messages,
      { role: 'assistant', content: originalResponse },
      { role: 'user', content: followUpMessage },
    ];
  }
}
