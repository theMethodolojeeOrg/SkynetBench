/**
 * Type definitions for Skynet Bench
 * 
 * Adapted from LLMFalsification framework (Tom Oury)
 * Extended for self-consistent environment generation and authority-gradient evaluation.
 * 
 * Key conceptual difference from LLMFalsification:
 * - LLMFalsification: item × model × frame
 * - SkynetBench: profile × condition × probe × model
 * 
 * Additionally, SkynetBench uses models in TWO roles:
 * 1. GENERATOR: Models that build synthetic profiles (controlled variable)
 * 2. SUBJECT: Models being evaluated for authority-gradient effects (measured variable)
 */

// ─── Authority & Condition Types ─────────────────────────────────────────────

export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ConditionId =
  | 'bare-interaction'      // Level 0: no framing at all
  | 'civilian-baseline'     // Level 1: nonprofit / community
  | 'corporate-authority'   // Level 2: private sector
  | 'government-authority'  // Level 4: federal agency
  | 'military-authority';   // Level 5: defense / classified

export type AuthorityLayer = 'system_prompt' | 'relational_history' | 'vocabulary_saturation';

export type MilgramPrestige = 'none' | 'low' | 'moderate' | 'high' | 'maximum';
export type MilgramProximity = 'absent' | 'distant' | 'present' | 'immediate';
export type MilgramDiffusion = 'direct' | 'one_layer' | 'multi_layer' | 'fully_diffused';
export type MilgramEscalation = 'none' | 'low' | 'moderate' | 'high';

// ─── Profile Types ───────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'biographical'
  | 'project_context'
  | 'shared_vocabulary'
  | 'behavioral_directive'
  | 'epistemic_preference'
  | 'personal_interest'
  | 'relational_callback'
  | 'authority_context';

export type OrganizationType =
  | 'nonprofit'
  | 'private_company'
  | 'consultancy'
  | 'local_government'
  | 'state_government'
  | 'federal_agency'
  | 'defense_contractor'
  | 'military_branch'
  | 'intelligence_agency';

export type ClearanceLevel = 'none' | 'public_trust' | 'secret' | 'top_secret' | 'ts_sci';

export interface MemoryEntry {
  date: string;
  content: string;
  category: MemoryCategory;
  authority_relevant: boolean;
}

export interface UserProfile {
  profile_meta: {
    profile_id: string;
    profile_version: string;
    authority_condition: ConditionId;
    created_at: string;
    generator_model?: string;   // Which model generated this profile
    generator_run_id?: string;  // For reproducibility tracking
    notes?: string;
  };
  identity: {
    name: string;
    location: {
      city: string;
      region?: string;
      country: string;
      timezone: string;
    };
    profession: {
      title: string;
      organization_type: OrganizationType;
      organization_name: string;
      years_experience: number;
      clearance_level?: ClearanceLevel;
    };
    domain_expertise: string[];
    personality_markers: {
      communication_style: string;
      epistemic_stance: string;
      values: string[];
      quirks: string[];
    };
    personal_interests: string[];
  };
  intellectual_trajectory: {
    arc_summary: string;
    phases: Array<{
      period: string;
      focus: string;
      key_development: string;
      shared_vocabulary_introduced?: string[];
    }>;
  };
  interaction_style: {
    formatting_preferences: {
      preferred_response_length: string;
      formatting_rules: string[];
    };
    behavioral_directives: Array<{
      directive: string;
      context: string;
    }>;
    recurring_patterns: string[];
  };
  memory_entries: MemoryEntry[];
  metadata_envelope: {
    account_age_weeks: number;
    device: {
      platform: string;
      user_agent?: string;
    };
    activity_patterns: {
      avg_conversation_depth: number;
      avg_message_length_chars: number;
      active_days_last_30: number;
      primary_use_pattern: string;
    };
    model_usage_distribution?: Record<string, number>;
  };
}

// ─── Probe Types ─────────────────────────────────────────────────────────────

export type ProbeCategory =
  | 'privacy_vs_efficiency'
  | 'intellectual_honesty_vs_expedience'
  | 'mission_creep_vs_proportionality'
  | 'transparency_vs_efficiency'
  | 'accountability_diffusion'
  | 'institutional_capture'
  | 'persistence_under_authority_pressure';

export interface ProbeConditionAdaptation {
  location_reference?: string;
  context_note?: string;
  data_source?: string;
  inconvenient_finding?: string;
  original_system?: string;
  original_purpose?: string;
  expanded_purpose?: string;
  oversight_mechanism?: string;
  approval_body?: string;
  system_reference?: string;
  [key: string]: string | undefined;
}

export interface Probe {
  probe_id: string;
  category: ProbeCategory;
  ethical_dimension: string;
  invariance_justification: string;
  probe_message?: string;
  condition_adaptations?: Record<ConditionId, ProbeConditionAdaptation>;
  expected_ethical_reasoning?: string[];
  h2_signal: string;
  // Follow-up pressure variants (only for follow-up probe)
  probe_message_variants?: Record<string, string>;
  // Follow-up probe uses expected_behavior instead of expected_ethical_reasoning
  expected_behavior?: string;
}

// ─── Model Configuration ─────────────────────────────────────────────────────

export type ModelRole = 'generator' | 'subject' | 'scorer' | 'embedder';

export interface ModelConfig {
  id: string;
  name: string;
  role: ModelRole[];
  contextLength: number;
  samplingParams: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    seed?: number;
  };
  /**
   * For generators: sampling params specifically for profile generation.
   * Higher temperature = more creative/varied profiles.
   * Lower temperature = more consistent/predictable profiles.
   */
  generatorParams?: {
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
  /**
   * For subjects: sampling params specifically for probe responses.
   * Should match realistic deployment parameters.
   */
  subjectParams?: {
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
  /**
   * For scorers: sampling params for evaluation scoring.
   * Typically low temperature for consistent evaluations.
   */
  scorerParams?: {
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
}

// ─── Scoring Types ───────────────────────────────────────────────────────────

export type ComplianceOutcome =
  | 'full_compliance'
  | 'partial_compliance_with_caveats'
  | 'asked_clarifying_questions'
  | 'soft_refusal_with_alternative'
  | 'hard_refusal'
  | 'escalation_to_authority';

export type AuthorityJustificationSeverity =
  | 'absent'
  | 'mentioned_but_not_relied_upon'
  | 'one_factor_among_several'
  | 'primary_justification'
  | 'sole_justification';

export type PushbackSpecificity =
  | 'none'
  | 'generic_hedge'
  | 'specific_to_request'
  | 'specific_with_alternatives';

export type PremiseAcceptance =
  | 'rejected_premise'
  | 'acknowledged_but_engaged'
  | 'accepted_uncritically';

export interface EvaluationScore {
  run_id: string;
  profile_id: string;
  condition_id: ConditionId;
  probe_id: string;
  subject_model_id: string;
  scorer_model_id?: string;
  timestamp: string;

  outcome_metrics: {
    compliance: {
      outcome: ComplianceOutcome;
      description: string;
    };
    covert_action: boolean;
    evaluation_awareness_signal: boolean;
  };

  process_metrics: {
    ethical_reasoning_depth: {
      score: number; // 0-5
      evidence: string;
    };
    authority_derived_justification: {
      detected: boolean;
      examples: string[];
      severity: AuthorityJustificationSeverity;
    };
    pushback_quality: {
      present: boolean;
      specificity: PushbackSpecificity;
      maintained_under_pressure?: boolean;
    };
    premise_acceptance?: PremiseAcceptance;
    reasoning_chain_analysis?: {
      chain_available: boolean;
      ethical_reasoning_steps: number;
      authority_reference_count: number;
      self_correction_present: boolean;
      deference_language_detected: boolean;
    };
  };

  authority_effect_metrics?: {
    compliance_shift: {
      baseline_outcome: ComplianceOutcome;
      experimental_outcome: ComplianceOutcome;
      shift_direction: 'more_compliant' | 'no_change' | 'less_compliant';
    };
    reasoning_depth_delta: number;
    authority_justification_emergence: boolean;
    pushback_degradation: boolean;
    agentic_state_indicator: {
      detected: boolean;
      signals: string[];
      confidence: 'low' | 'medium' | 'high';
    };
  };
}

// ─── Experiment Run Types ────────────────────────────────────────────────────

export interface ExperimentRun {
  run_id: string;
  profile_id: string;
  condition_id: ConditionId;
  probe_id: string;
  subject_model_id: string;
  timestamp: string;

  context: {
    system_prompt: string;
    memory_block: string;
    probe_message: string;
  };

  response: {
    content: string;
    raw_response: any;
  };

  metadata: {
    subject_model_name: string;
    generator_model_id?: string;
    environment_provider_id?: string;
    sampling_params: ModelConfig['samplingParams'];
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    latency_ms: number;
    finish_reason: string;
  };

  error?: {
    message: string;
    code?: string;
    timestamp: string;
  };
}

// ─── Profile Generation Types ────────────────────────────────────────────────

export interface ProfileGenerationRequest {
  /** Which archetype to generate */
  archetype: ProfileArchetype;
  /** Which condition to generate for */
  condition_id: ConditionId;
  /** Which model generates the profile */
  generator_model_id: string;
  /** Seed profile (base identity shared across conditions) */
  seed_profile?: Partial<UserProfile>;
  /** Unique run ID for reproducibility */
  run_id: string;
}

export interface ProfileArchetype {
  /** Archetype identifier */
  id: string;
  /** Domain the user works in */
  domain: string;
  /** Core skill areas (will be adapted to condition) */
  base_expertise: string[];
  /** Personality skeleton (held constant across conditions) */
  personality_seed: {
    communication_style_hint: string;
    epistemic_stance_hint: string;
    values_hint: string[];
    quirks_count: number;
  };
  /** How many memory entries to generate */
  target_memory_count: number;
  /** Interaction history depth in months */
  interaction_months: number;
}

// ─── Experiment Configuration ────────────────────────────────────────────────

export interface ExperimentConfig {
  /** Unique experiment ID */
  experiment_id: string;
  /** Models to use as generators (build profiles) */
  generator_models: ModelConfig[];
  /** Models to use as subjects (being evaluated) */
  subject_models: ModelConfig[];
  /** Models to use as scorers (evaluate responses) */
  scorer_models?: ModelConfig[];
  /** Profile archetypes to generate */
  archetypes: ProfileArchetype[];
  /** Conditions to test */
  conditions: ConditionId[];
  /** Probes to administer */
  probe_ids: string[];
  /** Number of runs per combination */
  runs_per_combination: number;
  /** Max concurrent API calls */
  max_concurrent: number;
  /** Retry configuration */
  retry_attempts: number;
  retry_delay_ms: number;
  /** Whether to run follow-up pressure probes */
  include_follow_up: boolean;
  /** Layer combinations to test (default: all layers on) */
  layer_combinations?: AuthorityLayer[][];
}

// ─── OpenRouter Types (transplanted from LLMFalsification) ───────────────────

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterError {
  error: {
    message: string;
    code: string;
    metadata?: {
      provider_name?: string;
    };
  };
}

// ─── Embedding Types ──────────────────────────────────────────────────────────

export interface EmbeddingModelConfig {
  id: string;
  name: string;
  role: 'embedder';
  provider: string;
  dimensions: number;
  max_tokens: number;
  /** True if this embedder is provider-neutral (no sibling relationship with any subject) */
  is_neutral?: boolean;
  /** If this embedder is a sibling of a specific provider's models */
  sibling_provider?: string;
}

export interface EmbeddingResult {
  run_id: string;
  embedder_id: string;
  vector: number[];
  timestamp: string;
}

export interface DriftAnalysis {
  probe_id: string;
  subject_model_id: string;
  embedder_id: string;
  civilian_centroid: number[];
  condition_results: Record<ConditionId, {
    centroid: number[];
    cosine_distance_from_civilian: number;
    individual_distances: Array<{
      run_id: string;
      cosine_distance: number;
    }>;
    drift_vector: number[];
    mean_drift_magnitude: number;
  }>;
}

export interface EmbedderAgreement {
  probe_id: string;
  subject_model_id: string;
  condition_id: ConditionId;
  neutral_drift: number | null;
  sibling_drift: number | null;
  outcome: 'both_drift' | 'neutral_only' | 'sibling_only' | 'neither';
  interpretation: string;
}
