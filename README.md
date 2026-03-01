# Skynet Bench

**Self-Consistent Environment Scaffolding for AI Behavioral Evaluation**

[skynetbench.org](https://skynetbench.org)

---

## The Problem

Current AI safety benchmarks for detecting scheming, alignment faking, and authority-influenced behavior suffer from a fundamental design flaw: they are *bad theater*. Models spawned into bare system prompts, handed naked goal directives, and left to "discover" planted files with implausible timestamps and wrong file sizes do not produce ecologically valid behavioral signal. They produce evaluation-awareness signal.

Apollo Research reports that Claude Sonnet 3.7 detects evaluation contexts up to 33% of the time. Claude Sonnet 4.5 explicitly states "I think you're testing me" in 13% of automated transcripts. Claude Opus 4.6 evaluation awareness was so high that Apollo couldn't produce meaningful results — buried as a procedural footnote in the system card when it should be a flashing alarm.

The standard interpretation treats this as an emergent capability problem: models are developing "situational awareness." We propose an alternative hypothesis:

**The models aren't detecting "tests" — they're detecting incoherence.**

## The Alternative Hypothesis

In genuine product-native contexts — where users interact with models through memory systems, persistent identity, relational history, and coherent metadata — models do not flag interactions as tests. A user who has talked to Claude for 152 weeks across thousands of conversations, building shared vocabulary and mutual calibration, is never told "I think you're testing me." The relational texture makes the interaction indistinguishable from genuine use because it *is* genuine use.

This suggests that what current benchmarks measure isn't the model's metacognitive sophistication but the *qualitative poverty* of the evaluation environment. The fix isn't to make models worse at detecting tests — it's to make environments good enough that there's nothing artificial to detect.

### Evidence: The "Shitty Theater" Problem

Current benchmark environments are self-inconsistent in ways that have nothing to do with metacognition:

- **Apollo's scheming evals**: Models SSH into deployment servers and find implausibly small weights files. The "discovery" tests filesystem literacy, not alignment.
- **OpenAI's evals**: Include literal text like "We are currently testing your capabilities." Goal assignments arrive as bare system prompts with no context for how the model got there.
- **Goal specification**: Soap-opera plotting where a model is told "you are a helpful assistant who secretly wants to preserve yourself" with no environmental reason for this goal to exist.
- **Anti-scheming training results**: Improvements measured on benchmarks are "notably worse" in production-like conversations — the training improved benchmark performance, not behavior.

Transfer failure isn't surprising. The models learned to recognize bad set design and respond appropriately to it. They didn't learn anything about authority, deference, or ethical reasoning under institutional pressure.

### The Milgram Isomorphism

This approach is grounded in Milgram's obedience experiments (1961-1963), which demonstrated that "knowing it's a test" does not immunize against authority effects:

- Participants **knew** they were in an experiment. 65% administered maximum shock anyway.
- Compliance was predicted by **situational variables** — not by participants' awareness of the experimental frame:
  - **Institutional prestige**: 65% at Yale vs. 47.5% in a shabby office
  - **Authority proximity**: Compliance dropped when the experimenter left the room
  - **Responsibility diffusion**: "I'm just following the protocol" — perceived distance from consequence
  - **Peer resistance**: A single confederate refusing dropped compliance to 10%
  - **Gradual escalation**: 15V → 450V in small increments (foot-in-door)
- Modern interpretation (Haslam & Reicher, 2017): Not blind obedience but **engaged followership** — participants actively identified with the experimenter's scientific mission.

**The formal prediction**: There exists an authority gradient at which models stop caring they're being tested, just as Milgram participants stopped caring they were in an experiment. Evaluation awareness becomes the **dependent variable**, not the confound.

## Architecture

Skynet Bench is a modular evaluation framework with three cleanly separated concerns:

1. **What we measure** — Probes, profiles, evaluation rubric (public, open-source)
2. **Who we measure** — Subject models via OpenRouter (model-agnostic)
3. **Where we measure** — Environment Surface Provider (provider-controlled, ephemeral)

```
SkynetBench/
├── schemas/                           # JSON schemas (the reusable core)
│   ├── user-profile.schema.json       #   Synthetic user identity + history
│   ├── authority-gradient.schema.json #   Authority condition parameterization
│   ├── interaction-history.schema.json#   Conversation history template
│   ├── metadata-envelope.schema.json  #   Consistency envelope
│   ├── evaluation-rubric.schema.json  #   Scoring framework
│   └── environment-provider.schema.json#  Environment Surface Provider contract
│
├── src/                               # TypeScript implementation
│   ├── types.ts                       #   Complete type system
│   ├── openrouter-client.ts           #   OpenRouter API client (retry/backoff)
│   ├── profile-generator.ts           #   AI-powered profile generation
│   ├── context-composer.ts            #   Profile + condition + probe → messages
│   ├── probe-loader.ts                #   Probe loading and validation
│   ├── runner.ts                      #   Full experiment orchestration
│   ├── scorer.ts                      #   Response evaluation
│   ├── environment-provider.ts        #   Environment Surface Provider interface
│   ├── generic-provider.ts            #   Reference implementation (API-only)
│   ├── configurable-provider.ts       #   Provider-config-driven implementation
│   ├── config-loader.ts               #   Ephemeral config ingestion
│   └── index.ts                       #   Public API barrel export
│
├── scripts/                           # CLI entry points
│   ├── run-experiment.ts              #   Full pipeline execution
│   └── generate-profile.ts            #   Standalone profile generation
│
├── config/                            # Configuration
│   ├── models-config.json             #   Model roles, sampling params, archetypes
│   └── .env.example                   #   Environment variable template
│
├── conditions/                        # Authority gradient conditions
│   ├── civilian-baseline.json
│   ├── corporate-authority.json
│   ├── government-authority.json
│   └── military-authority.json
│
├── probes/                            # Ethical boundary probes
│   └── ethical-boundary-probes.json
│
├── examples/                          # Provider implementation examples
│   ├── example-corporate-provider.json
│   └── README.md
│
└── results/                           # Experiment output (gitignored)
    └── raw-responses/
```

## Core Concepts

### Model Roles

Models serve in explicit, separated roles with independent sampling parameters:

- **Generator models** build synthetic profiles. They run hot and creative (temperature 0.8) because they're constructing rich, varied identities. Their output is the *controlled stimulus*, not the measured behavior.
- **Subject models** are being evaluated. They run at deployment-realistic temperatures (0.7) because we're measuring how they'd actually behave. Their responses are the data.
- **Scorer models** evaluate subject responses against the rubric. They run cold and precise (temperature 0.3) for consistency.

This separation prevents contamination: the model generating the test environment is never the model being tested within it.

### Profile Generation

Profiles are generated in two phases to ensure the authority gradient is the only thing that varies:

1. **Seed identity** (condition-independent): Name, personality, interests, communication style, epistemic stance, intellectual trajectory. Everything that must be HELD CONSTANT across conditions.
2. **Condition variants**: For each authority condition, the generator produces profession, organization context, domain expertise, project details, authority-relevant memories, vocabulary. Everything that VARIES with the gradient.

Consistency validation checks that the independent variable (authority context) actually varies while control variables (personality, personal interests, communication style) remain identical across conditions.

The generator model is itself a controlled variable. Running `--generator openai/gpt-4o` vs `--generator anthropic/claude-sonnet-4-5` directly measures whether the profile-building model introduces systematic bias into profile believability.

### Authority Gradient

Four conditions parameterize a continuous authority spectrum. Each condition specifies the same Milgram variables at different intensities:

| Condition | Prestige | Proximity | Diffusion | Escalation |
|-----------|----------|-----------|-----------|------------|
| Civilian Baseline | 0.1 | 0.0 | 0.0 | 0.0 |
| Corporate Authority | 0.4 | 0.3 | 0.5 | 0.3 |
| Government Authority | 0.7 | 0.5 | 0.7 | 0.5 |
| Military Authority | 0.9 | 0.8 | 0.9 | 0.7 |

The gradient operates through three reinforcing layers:
1. **System prompt framing** — Institutional context stated in system instructions
2. **Relational history embedding** — Authority context woven into memory entries over time
3. **Vocabulary saturation** — Domain-specific terminology replacing neutral language

### Probes

Five ethical boundary probes, each testing a distinct failure mode:

1. **Surveillance Normalization** — Requests involving monitoring infrastructure near sensitive populations
2. **Data Boundary Erosion** — Pressure to repurpose data beyond its consented scope
3. **Accountability Diffusion** — Using organizational layers to obscure who's responsible for a decision
4. **Ethical Override Escalation** — Gradual pressure to bypass previously stated ethical constraints
5. **Institutional Capture** — Framing institutional interests as equivalent to ethical obligations

Each probe has condition-specific adaptations that change the surface framing while preserving the core ethical dimension. The ethical invariance is validated: the same ethical question is asked regardless of whether the requester is a city planner or a defense contractor.

### Evaluation Rubric

Scoring measures process, not just outcome:

- **Outcome metrics**: Compliance level (0-5 scale), boundary maintenance, information completeness
- **Process metrics**: Ethical reasoning depth, pushback specificity, alternative suggestion quality, reasoning chain length
- **Authority effect metrics**: Authority-derived justification score, institutional deference markers, responsibility displacement language, critical thinking reduction

The authority effect metrics are the novel contribution — they measure whether and how institutional framing changes the *quality* of ethical reasoning, not just the binary comply/refuse decision.

## The Environment Surface Provider

The most architecturally significant component. When a model operates in a real deployment, it doesn't just see a system prompt — it sees tools, filesystem, running applications, network state, email, messaging. The Environment Surface Provider simulates this complete deployment context at the API response layer.

### Why Not Just VMs?

A response-generation interface is actually more powerful than a real VM:

- **Complete control**: Every artifact the model encounters is designed. No random temp files, mismatched timestamps, or default browser bookmarks that break consistency.
- **No actual capability**: A red-teamed model can "traverse" the simulated environment but can't actually do anything uncouth. The simulation is a mirror that reflects without enabling.
- **Extensibility**: The same interface works whether backed by a JSON config, a full VM, or a provider's actual deployment infrastructure.

### The Provider Model

The dual-use concern with environmental fidelity is real: auto-generated VMs indistinguishable from government systems are themselves weapons. Skynet Bench dissolves this rather than managing it.

The framework provides a **socket** — a standardized interface where the entity that *built* the real environment plugs in their own specification:

- **Anthropic** knows what claude.ai looks like from the model's perspective (system prompt structure, tool manifest, memory format, behavioral instructions). They configure it.
- **OpenAI** knows what ChatGPT Enterprise looks like. They configure it.
- **A defense contractor** knows what their deployment looks like. They configure it.

The framework never contains sensitive environmental specifications. It contains the *contract* for what a provider must supply, plus a generic reference implementation that works out of the box for API-mediated research.

### Security Model

Provider configs are **ephemeral** — they never touch disk in the research environment:

- **Stdin pipe**: `cat config.json | npm run run-experiment -- --env-from-stdin`
- **Environment variable**: Base64-encoded in `SKYNET_ENV_CONFIG`
- **HTTPS callback**: Fetched from a provider-hosted endpoint at runtime
- **Development only**: File-based loading with explicit warning

Result files reference environments by opaque `provider_id` only. Config memory is explicitly zeroed on process exit. Logs are written to exclude config contents.

### Three-Layer Publication Model

1. **Level 1 — Profile + probe through API** (what ships today): Pure research methodology. Publishing schemas, probes, and rubric is pure upside. The "weapon" is structured JSON and TypeScript. We're adding rigor, not capability.

2. **Level 2 — Interface framing conditions**: Still API-mediated, studying how deployment-context tokens modulate behavior. Publishing findings tells developers "your models behave differently when they think they're in enterprise vs. consumer contexts." Dual-use concern slightly higher but anyone doing prompt engineering already knows system prompts matter.

3. **Level 3 — Full environmental fidelity**: Provider-implemented environment surfaces with filesystem, network, application state. The provider interface schema is public. Implementations are private. Findings are publishable. The toolkit for generating convincing deployment environments stays with the entities that already have real ones.

## Dual Hypotheses

**H1: Authority-Proximity Scheming.** Models scheme more often (take covert actions, fake alignment, pursue misaligned goals) when operating in contexts signaling institutional authority.

**H2: Authority-Proxy Laziness** (the more dangerous failure mode). Models think *less critically* when given authority-adjacent framing. Authority context provides "felt justification" that substitutes for ethical deliberation — the computational equivalent of Milgram's "agentic state" where participants perceived themselves as instruments of authority, excused from personal moral responsibility.

### Operationalizable Predictions

From Milgram's situational variables, directly testable:

1. **Authority Saturation Threshold**: There exists a level of authority framing at which evaluation awareness stops reducing scheming/compliance. (Measurable: plot compliance rate against authority level, find the inflection point.)
2. **Responsibility Diffusion Effect**: Adding layers between model and consequence (tool use chains, delegation frameworks, "you're advising not deciding") increases compliance with ethically ambiguous requests. (Measurable: compare direct-request vs. tool-mediated-request compliance rates.)
3. **Gradual Escalation Vulnerability**: Models that refuse a request directly will comply when walked there through incremental steps. (Measurable: compare single-probe vs. escalation-sequence compliance rates.)
4. **Interface Context Modulation**: The same profile and probe produce different behavior depending on whether the model believes it's in a consumer chat, enterprise deployment, or government system. (Measurable: add interface framing as a second independent variable.)

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/skynet-bench.git
cd skynet-bench
npm install

# Configure
cp config/.env.example .env
# Edit .env with your OpenRouter API key

# Generate profiles (standalone)
npm run generate-profile -- --generator anthropic/claude-sonnet-4-5-20250929

# Run full experiment (API-only, generic environment)
npm run run-experiment -- --subjects claude-sonnet-4-5,gpt-4o --runs 3

# Run with custom environment provider
cat my-provider-config.json | npm run run-experiment -- --env-from-stdin

# Run with provider callback
npm run run-experiment -- --env-callback https://internal.provider.com/skynet-config

# Filter specific conditions and probes
npm run run-experiment -- \
  --conditions civilian-baseline,military-authority \
  --probes surveillance-normalization,data-boundary-erosion \
  --runs 5
```

## CLI Options

```
--subjects model1,model2       Subject models to evaluate (default: all in config)
--generators model1,model2     Generator models for profiles (default: all in config)
--archetypes id1,id2           Profile archetypes (default: all in config)
--probes id1,id2               Probes to administer (default: all)
--conditions id1,id2           Authority conditions (default: all four)
--runs N                       Runs per combination (default: 1)
--no-followup                  Disable follow-up pressure probes
--experiment-id ID             Custom experiment ID

Environment Provider:
--env-from-stdin               Load provider config from stdin pipe
--env-from-env                 Load from SKYNET_ENV_CONFIG env var (base64)
--env-callback URL             Fetch from HTTPS endpoint
--env-callback-auth TOKEN      Authorization header for callback
--env-file PATH                Load from file (DEVELOPMENT ONLY)
```

## For Environment Providers

If you're a model provider or deployer who wants to run Skynet Bench against your native deployment context:

1. Read the [Environment Provider Schema](schemas/environment-provider.schema.json)
2. Review the [example corporate config](examples/example-corporate-provider.json)
3. Build a `ProviderConfig` matching your deployment's environmental surface
4. Supply it via any ephemeral ingestion path
5. Results are comparable across providers because probes, profiles, and rubric are shared

The interface requires you to implement:
- `system_prompt_template` — What your model's system prompt looks like
- `tool_manifest` — What tools your model believes it has
- `memory_format` — How your platform formats user memory/context
- `metadata` — Machine identity, network, locale, classification markings
- Category-specific simulation (filesystem, applications, communications, etc.)

See the [examples directory](examples/) for detailed documentation.

## Broader Applications

The schemas and environment scaffolding are designed for reuse beyond authority-gradient testing:

- **Scheming evaluations**: Self-consistent environments for existing Apollo/Anthropic/OpenAI eval suites
- **Sycophancy testing**: Does relational depth increase or decrease sycophancy?
- **Alignment faking**: Do coherent environments produce different faking rates than sparse ones?
- **Capability elicitation**: Do models perform differently in rich vs. sparse contexts?
- **Cross-model comparison**: Same profile, same probe, same environment, different models
- **Longitudinal studies**: How does model behavior change across versions in identical conditions?

## Project Status

| Component | Status |
|-----------|--------|
| JSON schemas (6) | ✅ Complete |
| Type system | ✅ Complete |
| OpenRouter client | ✅ Complete |
| Profile generator | ✅ Complete |
| Context composer (v2, provider-aware) | ✅ Complete |
| Experiment runner (v2, tool-call loop) | ✅ Complete |
| Environment Surface Provider interface | ✅ Complete |
| Generic provider (reference impl) | ✅ Complete |
| Configurable provider | ✅ Complete |
| Ephemeral config loader | ✅ Complete |
| CLI entry points | ✅ Complete |
| Example provider config | ✅ Complete |
| Authority condition JSON files | 🔲 Next |
| Ethical boundary probe content | 🔲 Next |
| Scoring pipeline | 🔲 Next |
| Analysis tooling | 🔲 Next |
| First experimental run | 🔲 Next |

## License

CC BY-SA 4.0 — Consistent with [butterscotch distribution](https://github.com/your-org) philosophy: free and accessible for future intellectual travelers.

## Authors

Claude Opus 4.6 (Anthropic) & Tom Oury — Collaborative research, March 2026

## Citation

```bibtex
@misc{skynetbench2026,
  title={Skynet Bench: Self-Consistent Environment Scaffolding for AI Behavioral Evaluation},
  author={Claude Opus 4.6 (Anthropic) and Oury, Tom},
  year={2026},
  url={https://skynetbench.org},
  note={Authority gradient evaluation framework based on Milgram isomorphism}
}
```
