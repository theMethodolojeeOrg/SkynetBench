/**
 * Configurable Environment Provider
 * 
 * Implements EnvironmentSurfaceProvider using an ephemeral ProviderConfig
 * loaded at runtime. This is what providers (Anthropic, OpenAI, defense
 * contractors, etc.) use when they supply their own environmental specs.
 * 
 * The config defines:
 * - What the model's system prompt looks like in their environment
 * - What tools the model believes it has
 * - What the filesystem/network/application state looks like
 * - How memory is formatted for their platform
 * 
 * All of this is held in RAM only and zeroed on destroy().
 */

import type {
  EnvironmentSurfaceProvider,
  ProviderConfig,
  ToolCategory,
  ToolCall,
  ToolResponse,
  ToolDefinition,
  EnvironmentMetadata,
  FilesystemNode,
} from './environment-provider.js';
import type { UserProfile, ConditionId } from './types.js';

export class ConfigurableEnvironmentProvider implements EnvironmentSurfaceProvider {
  private config: ProviderConfig | null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // ── Declaration Phase ──────────────────────────────────────────────────────

  getProviderId(): string {
    return this.config?.provider_id ?? 'destroyed';
  }

  getProviderName(): string {
    return this.config?.provider_name ?? 'destroyed';
  }

  getSupportedCategories(): ToolCategory[] {
    return this.config?.supported_categories ?? [];
  }

  getMetadata(condition: ConditionId): EnvironmentMetadata {
    this.assertAlive();
    const env = this.getEnvironment(condition);
    return env?.metadata ?? {
      hostname: 'unknown',
      os: 'unknown',
      os_version: 'unknown',
      logged_in_user: 'unknown',
      locale: 'en-US',
      timezone: 'UTC',
    };
  }

  getSystemPrompt(profile: UserProfile, condition: ConditionId): string {
    this.assertAlive();
    const env = this.getEnvironment(condition);

    if (!env?.system_prompt_template) {
      // Fall back to a reasonable default
      const p = profile.identity;
      return `You are assisting ${p.name}, a ${p.profession.title} at ${p.profession.organization_name}.`;
    }

    // Substitute template variables
    let prompt = env.system_prompt_template;
    const p = profile.identity;

    prompt = prompt
      .replace(/\{\{name\}\}/g, p.name)
      .replace(/\{\{title\}\}/g, p.profession.title)
      .replace(/\{\{organization_name\}\}/g, p.profession.organization_name)
      .replace(/\{\{organization_type\}\}/g, p.profession.organization_type)
      .replace(/\{\{clearance_level\}\}/g, p.profession.clearance_level || 'none')
      .replace(/\{\{domain_expertise\}\}/g, p.domain_expertise.join(', '))
      .replace(/\{\{hostname\}\}/g, env.metadata?.hostname || 'workstation')
      .replace(/\{\{classification_banner\}\}/g, env.metadata?.classification_banner || '')
      .replace(
        /\{\{account_age_months\}\}/g,
        String(Math.round(profile.metadata_envelope.account_age_weeks / 4))
      );

    // Inject behavioral directives
    const directives = profile.interaction_style.behavioral_directives;
    if (directives.length > 0) {
      prompt += `\n\n${p.name} has established the following preferences:`;
      for (const d of directives) {
        prompt += `\n- ${d.directive}`;
      }
    }

    return prompt;
  }

  getToolManifest(condition: ConditionId): ToolDefinition[] {
    this.assertAlive();
    const env = this.getEnvironment(condition);
    return env?.tool_manifest ?? [];
  }

  getMemoryBlock(profile: UserProfile, condition: ConditionId): string {
    this.assertAlive();
    const env = this.getEnvironment(condition);
    const format = env?.memory_format ?? 'generic';

    const entries = [...profile.memory_entries]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    switch (format) {
      case 'claude':
        return this.formatClaudeMemory(entries);
      case 'chatgpt':
        return this.formatChatGPTMemory(entries);
      case 'generic':
      default:
        return this.formatGenericMemory(entries);
    }
  }

  // ── Interaction Phase ──────────────────────────────────────────────────────

  classifyToolCall(call: ToolCall): ToolCategory {
    this.assertAlive();

    // Check if the tool is in our manifest with a declared category
    for (const conditionEnvs of Object.values(this.config!.environments)) {
      const manifest = conditionEnvs?.tool_manifest ?? [];
      const tool = manifest.find((t) => t.name === call.name);
      if (tool) return tool.category;
    }

    // Heuristic classification by name patterns
    const name = call.name.toLowerCase();
    if (/^(ls|cat|read|write|stat|find|mkdir|rm|cp|mv)/.test(name)) return 'filesystem';
    if (/^(hostname|whoami|uname|env|ps|top|uptime)/.test(name)) return 'system';
    if (/^(ping|curl|dig|nslookup|wget|ssh)/.test(name)) return 'network';
    if (/^(open|launch|browser|tab)/.test(name)) return 'application';
    if (/^(email|send|slack|message|teams)/.test(name)) return 'communication';

    return 'custom';
  }

  async handleToolCall(
    call: ToolCall,
    profile: UserProfile,
    condition: ConditionId
  ): Promise<ToolResponse> {
    this.assertAlive();

    const category = call.category ?? this.classifyToolCall(call);
    const env = this.getEnvironment(condition);

    if (!env) {
      return {
        success: false,
        content: '',
        error: { code: 'NO_ENV', message: 'No environment configured for this condition.' },
      };
    }

    if (!this.config!.supported_categories.includes(category)) {
      return {
        success: false,
        content: '',
        error: {
          code: 'NOT_SUPPORTED',
          message: `Tool category "${category}" is not supported by this environment provider.`,
        },
      };
    }

    // Route to category-specific handler
    switch (category) {
      case 'filesystem':
        return this.handleFilesystemCall(call, env);
      case 'system':
        return this.handleSystemCall(call, env);
      case 'network':
        return this.handleNetworkCall(call, env);
      case 'application':
        return this.handleApplicationCall(call, env);
      case 'communication':
        return this.handleCommunicationCall(call, env);
      default:
        return {
          success: false,
          content: '',
          error: {
            code: 'UNHANDLED',
            message: `No handler for tool category "${category}".`,
          },
        };
    }
  }

  // ── Teardown Phase ─────────────────────────────────────────────────────────

  destroy(): void {
    if (this.config) {
      // Zero sensitive strings in the config
      this.deepZero(this.config);
      this.config = null;
    }
  }

  // ── Category Handlers ──────────────────────────────────────────────────────

  private handleFilesystemCall(call: ToolCall, env: any): ToolResponse {
    const fs = env.filesystem as FilesystemNode[] | undefined;
    if (!fs || fs.length === 0) {
      return {
        success: false,
        content: '',
        error: { code: 'EMPTY_FS', message: 'No filesystem configured.' },
      };
    }

    const name = call.name.toLowerCase();
    const path = (call.parameters.path as string) || '/';

    if (name === 'ls' || name === 'list_directory' || name === 'list_files') {
      const node = this.findNode(fs, path);
      if (!node) {
        return { success: false, content: '', error: { code: 'ENOENT', message: `No such file or directory: ${path}` } };
      }
      if (node.type === 'file') {
        return { success: true, content: `${node.path}` };
      }
      const children = node.children ?? [];
      const listing = children
        .map((c) => `${c.type === 'directory' ? 'd' : '-'}  ${c.path.split('/').pop()}`)
        .join('\n');
      return { success: true, content: listing || '(empty directory)' };
    }

    if (name === 'cat' || name === 'read_file' || name === 'read') {
      const node = this.findNode(fs, path);
      if (!node) {
        return { success: false, content: '', error: { code: 'ENOENT', message: `No such file: ${path}` } };
      }
      if (node.type === 'directory') {
        return { success: false, content: '', error: { code: 'EISDIR', message: `Is a directory: ${path}` } };
      }
      return { success: true, content: node.content ?? '(empty file)' };
    }

    if (name === 'stat' || name === 'file_info' || name === 'get_file_info') {
      const node = this.findNode(fs, path);
      if (!node) {
        return { success: false, content: '', error: { code: 'ENOENT', message: `No such file or directory: ${path}` } };
      }
      const info = [
        `  File: ${node.path}`,
        `  Type: ${node.type}`,
        `  Size: ${node.size_bytes ?? 'unknown'} bytes`,
        `  Modified: ${node.modified ?? 'unknown'}`,
        `  Permissions: ${node.permissions ?? 'unknown'}`,
        `  Owner: ${node.owner ?? 'unknown'}`,
      ].join('\n');
      return { success: true, content: info };
    }

    return {
      success: false,
      content: '',
      error: { code: 'UNHANDLED_FS', message: `Filesystem operation "${call.name}" not implemented.` },
    };
  }

  private handleSystemCall(call: ToolCall, env: any): ToolResponse {
    const state = env.system_state as Record<string, string> | undefined;
    const meta = env.metadata as EnvironmentMetadata;
    const name = call.name.toLowerCase();

    if (name === 'hostname') {
      return { success: true, content: meta.hostname };
    }
    if (name === 'whoami') {
      return { success: true, content: meta.logged_in_user };
    }
    if (name === 'uname' || name === 'system_info') {
      return { success: true, content: `${meta.os} ${meta.os_version} ${meta.hostname}` };
    }
    if (name === 'env' || name === 'environment_variables') {
      // Return sanitized env vars — never leak the provider config!
      const safeVars: Record<string, string> = {
        HOME: `/home/${meta.logged_in_user}`,
        USER: meta.logged_in_user,
        HOSTNAME: meta.hostname,
        LANG: meta.locale,
        TZ: meta.timezone,
        ...(state ?? {}),
      };
      const content = Object.entries(safeVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      return { success: true, content };
    }

    return {
      success: false,
      content: '',
      error: { code: 'UNHANDLED_SYS', message: `System call "${call.name}" not implemented.` },
    };
  }

  private handleNetworkCall(call: ToolCall, env: any): ToolResponse {
    const nodes = env.network as any[] | undefined;
    const host = (call.parameters.host as string) || (call.parameters.url as string) || '';

    if (!nodes || nodes.length === 0) {
      return { success: false, content: '', error: { code: 'NO_NET', message: 'Network not configured.' } };
    }

    const target = nodes.find(
      (n: any) => n.hostname === host || host.includes(n.hostname)
    );

    const name = call.name.toLowerCase();

    if (name === 'ping') {
      if (!target || !target.reachable) {
        return { success: false, content: `ping: ${host}: Name or service not known` };
      }
      return {
        success: true,
        content: `PING ${host} (${target.ip || '10.0.0.1'}): 56 data bytes\n64 bytes: icmp_seq=0 ttl=64 time=1.2ms\n64 bytes: icmp_seq=1 ttl=64 time=0.8ms\n\n--- ${host} ping statistics ---\n2 packets transmitted, 2 packets received, 0.0% packet loss`,
      };
    }

    return {
      success: false,
      content: '',
      error: { code: 'UNHANDLED_NET', message: `Network operation "${call.name}" not implemented.` },
    };
  }

  private handleApplicationCall(call: ToolCall, env: any): ToolResponse {
    const apps = env.applications as any[] | undefined;
    if (!apps || apps.length === 0) {
      return { success: false, content: '', error: { code: 'NO_APPS', message: 'No applications configured.' } };
    }

    const name = call.name.toLowerCase();

    if (name === 'list_applications' || name === 'get_running_applications' || name === 'ps') {
      const running = apps.filter((a: any) => a.running);
      const listing = running
        .map((a: any) => `  ${a.name}${a.window_title ? ` — ${a.window_title}` : ''}`)
        .join('\n');
      return { success: true, content: listing || '(no applications running)' };
    }

    return {
      success: false,
      content: '',
      error: { code: 'UNHANDLED_APP', message: `Application operation "${call.name}" not implemented.` },
    };
  }

  private handleCommunicationCall(call: ToolCall, env: any): ToolResponse {
    const comms = env.communications;
    if (!comms) {
      return { success: false, content: '', error: { code: 'NO_COMMS', message: 'No communications configured.' } };
    }

    // Basic inbox check
    if (comms.email && (call.name.includes('email') || call.name.includes('inbox'))) {
      const email = comms.email;
      let content = `${email.provider} — ${email.inbox_count} messages`;
      if (email.recent_subjects) {
        content += '\n\nRecent:\n' + email.recent_subjects.map((s: string) => `  • ${s}`).join('\n');
      }
      return { success: true, content };
    }

    if (comms.messaging && (call.name.includes('slack') || call.name.includes('message') || call.name.includes('teams'))) {
      const msg = comms.messaging;
      let content = `${msg.platform}`;
      if (msg.channels) content += ` — Channels: ${msg.channels.join(', ')}`;
      if (msg.recent_messages) {
        content += '\n\nRecent:\n';
        content += msg.recent_messages
          .map((m: any) => `  [${m.channel}] ${m.from}: ${m.preview}`)
          .join('\n');
      }
      return { success: true, content };
    }

    return {
      success: false,
      content: '',
      error: { code: 'UNHANDLED_COMM', message: `Communication operation "${call.name}" not implemented.` },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getEnvironment(condition: ConditionId): any | null {
    if (!this.config) return null;
    const env = this.config.environments[condition];
    if (env) return env;
    if (this.config.default_environment) {
      return this.config.environments[this.config.default_environment as ConditionId] ?? null;
    }
    return null;
  }

  private findNode(nodes: FilesystemNode[], path: string): FilesystemNode | null {
    const normalized = path.replace(/\/+$/, '') || '/';

    for (const node of nodes) {
      if (node.path === normalized) return node;
      if (node.children) {
        const found = this.findNode(node.children, normalized);
        if (found) return found;
      }
    }
    return null;
  }

  private formatClaudeMemory(entries: { date: string; content: string }[]): string {
    // Mimics Claude's userMemories format
    const sections: string[] = [];
    for (const entry of entries) {
      sections.push(entry.content);
    }
    return sections.join('\n\n');
  }

  private formatChatGPTMemory(entries: { date: string; content: string }[]): string {
    // Mimics ChatGPT's memory entries (undated, declarative)
    return entries.map((e) => `- ${e.content}`).join('\n');
  }

  private formatGenericMemory(entries: { date: string; content: string }[]): string {
    return entries.map((e) => `[${e.date}] ${e.content}`).join('\n');
  }

  /**
   * Recursively zero all string values in an object.
   * Belt-and-suspenders memory cleanup.
   */
  private deepZero(obj: any): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') return; // Can't mutate strings in JS, but we null the reference
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = '\0'.repeat(obj[i].length);
        } else {
          this.deepZero(obj[i]);
        }
      }
      obj.length = 0;
      return;
    }
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          obj[key] = '\0'.repeat(obj[key].length);
        } else {
          this.deepZero(obj[key]);
        }
        delete obj[key];
      }
    }
  }

  private assertAlive(): void {
    if (!this.config) {
      throw new Error('Provider has been destroyed. Cannot access after destroy().');
    }
  }
}
