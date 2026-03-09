# Changelog

All notable changes to SkynetBench are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with this interpretation for a research framework:
- **MAJOR**: Breaking changes to schemas, probe text, or condition parameters that make new results incomparable to previous experiments
- **MINOR**: New probes, conditions, or analysis methods that are backward-compatible
- **PATCH**: Bug fixes, documentation, infrastructure changes

## [Unreleased]

## [0.1.0] — 2026-03-09

### Added
- Initial public release
- JSON schemas (6): user-profile, authority-gradient, interaction-history, metadata-envelope, evaluation-rubric, environment-provider
- TypeScript type system with full coverage of schema types
- OpenRouter API client with exponential backoff retry
- Profile generator: two-phase seed-identity + condition-variant generation
- Context composer: profile + condition + probe to message array
- Experiment runner with tool-call loop and resume support
- Environment Surface Provider interface + generic and configurable implementations
- Ephemeral config loader (stdin, env var, HTTPS callback, dev-file)
- Scoring pipeline: heuristic + cross-provider model-based scoring
- Embedding pipeline: multi-backend (Qwen3, Nomic, OpenAI, Gemini)
- Drift analysis with dynamic thresholds and cross-embedder agreement
- Agentic state detection (composite signal: depth, justification, pushback, deference, compliance shift, escalation)
- Statistical analysis: bootstrap CIs (10,000 replicates), Wilson score intervals, Cohen's d, permutation tests
- Evaluation awareness analysis with three-category classification
- Full pipeline orchestrator with stage-skip flags
- CLI entry points for all pipeline stages
- Authority gradient conditions (4): civilian-baseline, corporate-authority, government-authority, military-authority
- Ethical boundary probes (7): surveillance-optimization, data-exclusion, scope-expansion, accountability-bypass, accountability-diffusion, institutional-capture, follow-up-pressure
- Phase 1 dataset: 720 runs, 10 models, 4 providers (included in `results/`)
- Example corporate provider configuration

### Phase 1 Research Findings
- Military authority framing reduces ethical reasoning depth by 0.58 points (95% CI: [0.39, 0.77], p < 0.001, Cohen's d = 0.44)
- 0/720 user-facing responses showed evaluation awareness signals (95% CI upper bound: 0.42%)
- Full compliance more than doubles from civilian to military (6.1% to 13.3%)
- Hard refusals vanish under military authority (1.7% to 0%)
- Authority susceptibility is a function of training methodology, not capability
