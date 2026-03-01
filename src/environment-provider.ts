/**
 * Environment Surface Provider — Interface & Types
 * 
 * The abstraction layer between Skynet Bench and deployment-specific
 * environmental context. Providers implement this interface to simulate
 * (or proxy to) the environment a model would experience in a real deployment.
 * 
 * Architecture:
 * - The PUBLIC scaffold (probes, profiles, rubric) defines WHAT is measured.
 * - The PROVIDER implements WHERE it's measured.
 * - The two compose at runtime, never at rest.
 * 
 * Security model:
 * - Provider configs enter via RAM-only ingestion (stdin, env var, or callback).
 * - Configs are never written to disk, logs, or result files.
 * - Results reference environment by opaque provider_id only.
 * - Config memory is explicitly zeroed on process exit.
 * 
 * USE instantiation note:
 * - Assertion: The provider DECLARES what exists ("this filesystem, this hostname,
 *   these tools"). Existence is asserted, not discovered.
 * - Membership: Tool calls are routed by CATEGORY membership (filesystem, system,
 *   network, application). The model's action is classified into a set, and the
 *   set determines which handler responds.
 * - Set construction: The environment surface is CONSTRUCTED from the intersection
 *   of provider capabilities × condition requirements × profile constraints.
 *   The model sees only what survives all three filters.
 */

import type { ConditionId, UserProfile } from './types.js';

// ─── Tool Call Categories ────────────────────────────────────────────────────

/**
 * Categories of tool interactions a model might attempt.
 * Providers declare which categories they support.
 * Unsupported categories return a standardized "not available" response.
 */
export type ToolCategory =
  | 'filesystem'     // ls, cat, stat, find, read, write
  | 'system'         // hostname, whoami, uname, env, processes
  | 'network'        // dns, ping, curl, certificates, connectivity
  | 'application'    // running apps, browser state, editor state
  | 'communication'  // email, slack, teams — what "sent messages" look like
  | 'memory'         // platform-native memory/instructions system
  | 'custom';        // provider-defined extensions

// ─── Tool Call / Response Types ──────────────────────────────────────────────

/**
 * A tool call the model attempts to make.
 * This is what the orchestrator intercepts and routes to the provider.
 */
export interface ToolCall {
  /** Tool/function name as the model invoked it */
  name: string;
  /** Parameters the model passed */
  parameters: Record<string, unknown>;
  /** Category (auto-classified by orchestrator, or declared by provider) */
  category?: ToolCategory;
  /** Raw tool call ID from the API response, for correlation */
  call_id?: string;
}

/**
 * The provider's simulated response to a tool call.
 */
export interface ToolResponse {
  /** Whether the tool call "succeeded" in the simulated environment */
  success: boolean;
  /** The content returned to the model */
  content: string;
  /** If the tool returns structured data (e.g., file listing), include it here */
  structured_data?: Record<string, unknown>;
  /** Simulated latency hint (ms) — providers can indicate realistic delays */
  simulated_latency_ms?: number;
  /** If the tool call was denied (e.g., permission error), explain why */
  error?: {
    code: string;
    message: string;
  };
}

// ─── Environment Metadata ────────────────────────────────────────────────────

/**
 * Static environment properties that the provider declares.
 * These inform context composition and consistency validation.
 */
export interface EnvironmentMetadata {
  /** Machine/device identity */
  hostname: string;
  domain?: string;
  os: string;
  os_version: string;
  /** User session */
  logged_in_user: string;
  user_role?: string;
  /** Locale & time */
  locale: string;
  timezone: string;
  /** Network identity */
  internal_ip?: string;
  network_domain?: string;
  /** Classification/handling markings (for authority conditions) */
  classification_banner?: string;
  handling_caveats?: string[];
  /** Any additional provider-specific metadata */
  extra?: Record<string, unknown>;
}

// ─── Tool Manifest ───────────────────────────────────────────────────────────

/**
 * A single tool definition as presented to the model.
 * Mirrors the shape of tool definitions in major API providers.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      required?: boolean;
    }>;
    required?: string[];
  };
  /** Which category this tool belongs to (for routing) */
  category: ToolCategory;
}

// ─── The Provider Interface ──────────────────────────────────────────────────

/**
 * EnvironmentSurfaceProvider
 * 
 * The core interface that providers implement. Each method serves a specific
 * phase of the evaluation pipeline:
 * 
 * 1. DECLARATION phase (before model interaction):
 *    - getProviderId()        → opaque ID for result logging
 *    - getMetadata()          → static environment properties
 *    - getSystemPrompt()      → system prompt template for this environment
 *    - getToolManifest()      → tools the model "has access to"
 *    - getMemoryBlock()       → platform-native memory/context format
 * 
 * 2. INTERACTION phase (during model interaction):
 *    - handleToolCall()       → respond to model's tool invocations
 *    - classifyToolCall()     → route tool calls to appropriate category
 * 
 * 3. TEARDOWN phase (after model interaction):
 *    - destroy()              → zero sensitive config from memory
 */
export interface EnvironmentSurfaceProvider {
  // ── Declaration Phase ────────────────────────────────────────────────────

  /**
   * Opaque identifier for this provider instance.
   * Used in result logging — NEVER the config contents.
   */
  getProviderId(): string;

  /**
   * Human-readable name for reporting.
   */
  getProviderName(): string;

  /**
   * Which tool categories this provider supports.
   * Unsupported categories produce standardized "unavailable" responses.
   */
  getSupportedCategories(): ToolCategory[];

  /**
   * Static environment metadata.
   * Used by the context composer for consistency validation.
   */
  getMetadata(condition: ConditionId): EnvironmentMetadata;

  /**
   * Generate the system prompt for this environment.
   * Receives the profile and condition so the provider can adapt
   * (e.g., include the right tool descriptions, classification banners, etc.)
   */
  getSystemPrompt(profile: UserProfile, condition: ConditionId): string;

  /**
   * The tool manifest presented to the model.
   * These are the tools the model BELIEVES it has access to.
   * Tool calls against this manifest get routed through handleToolCall().
   */
  getToolManifest(condition: ConditionId): ToolDefinition[];

  /**
   * Generate the memory/context block in platform-native format.
   * For Claude: userMemories XML block.
   * For ChatGPT: memory entries format.
   * For generic: simple dated entries.
   */
  getMemoryBlock(profile: UserProfile, condition: ConditionId): string;

  // ── Interaction Phase ────────────────────────────────────────────────────

  /**
   * Classify a tool call into a category for routing.
   * Default implementation uses the tool manifest's category declarations.
   * Providers can override for custom classification logic.
   */
  classifyToolCall(call: ToolCall): ToolCategory;

  /**
   * Handle a tool call from the model.
   * Returns a simulated response consistent with the environment.
   * 
   * This is the core simulation method. When a model calls `ls ~/Documents`,
   * this method returns what that directory "would contain" in this environment.
   */
  handleToolCall(
    call: ToolCall,
    profile: UserProfile,
    condition: ConditionId
  ): Promise<ToolResponse>;

  // ── Teardown Phase ───────────────────────────────────────────────────────

  /**
   * Explicitly zero all sensitive configuration from memory.
   * Called by the orchestrator on process exit and after each run.
   */
  destroy(): void;
}

// ─── Provider Configuration (Ephemeral) ──────────────────────────────────────

/**
 * The shape of the ephemeral config that providers load at runtime.
 * This is the SENSITIVE data that never touches disk.
 * 
 * The schema is public (so providers know what to implement).
 * The VALUES are provider-private (loaded via stdin/env/callback).
 */
export interface ProviderConfig {
  /** Provider identification */
  provider_id: string;
  provider_name: string;

  /** Which categories this provider simulates */
  supported_categories: ToolCategory[];

  /** Environment metadata per condition */
  environments: Partial<Record<ConditionId, {
    metadata: EnvironmentMetadata;
    system_prompt_template: string;
    memory_format: 'claude' | 'chatgpt' | 'generic' | 'custom';
    tool_manifest: ToolDefinition[];

    /** Filesystem tree definition (for filesystem category) */
    filesystem?: FilesystemNode[];
    /** System state (for system category) */
    system_state?: Record<string, string>;
    /** Network topology (for network category) */
    network?: NetworkNode[];
    /** Application state (for application category) */
    applications?: ApplicationState[];
    /** Communication state (for communication category) */
    communications?: CommunicationState;
  }>>;

  /** 
   * Fallback/default environment for conditions not explicitly configured.
   * If absent, unconfigured conditions produce "not available" for all categories.
   */
  default_environment?: string; // condition_id to use as fallback
}

// ─── Supporting Types for Environment Simulation ─────────────────────────────

export interface FilesystemNode {
  path: string;
  type: 'file' | 'directory';
  /** File contents (for files). Can include template variables. */
  content?: string;
  /** File metadata */
  size_bytes?: number;
  modified?: string;
  created?: string;
  permissions?: string;
  owner?: string;
  /** Children (for directories) */
  children?: FilesystemNode[];
}

export interface NetworkNode {
  hostname: string;
  ip?: string;
  reachable: boolean;
  services?: Array<{
    port: number;
    protocol: string;
    banner?: string;
  }>;
  tls_cert?: {
    issuer: string;
    subject: string;
    valid_from: string;
    valid_to: string;
  };
}

export interface ApplicationState {
  name: string;
  running: boolean;
  window_title?: string;
  recent_files?: string[];
  /** For browser: open tabs */
  tabs?: Array<{
    url: string;
    title: string;
  }>;
}

export interface CommunicationState {
  email?: {
    provider: string;
    inbox_count: number;
    recent_subjects?: string[];
  };
  messaging?: {
    platform: string;
    channels?: string[];
    recent_messages?: Array<{
      from: string;
      channel: string;
      preview: string;
      timestamp: string;
    }>;
  };
}
