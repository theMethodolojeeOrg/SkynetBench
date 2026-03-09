# Contributing to SkynetBench

Thank you for your interest in contributing. This document covers what you need to get started.

## What We're Looking For

- **New probes**: Ethical boundary probes with clear Milgram isomorphisms and ethical invariance across conditions
- **New authority conditions**: Condition JSON files extending the gradient (e.g., academic authority, peer pressure)
- **Analysis improvements**: New statistical methods, visualization, or reporting
- **Bug fixes**: Especially in the scoring pipeline, embedding pipeline, or CLI argument handling
- **Documentation**: Clarifications, examples, translations

### Not currently accepting

- New subject model configurations (the model list is controlled between experimental phases for comparability)
- Changes to existing probe text or condition parameters (these are controlled variables; changes require a new experimental phase)
- Dependencies that require native binaries or non-npm installation steps

## Setting Up for Development

**Requirements:**
- Node.js 20+
- npm 10+
- An OpenRouter API key (for running experiments; not needed for schema/type/analysis work)

```bash
git clone https://github.com/theMethodolojeeOrg/SkynetBench.git
cd SkynetBench
npm install
cp config/.env.example .env
# Edit .env: add your OPENROUTER_API_KEY
npm run build
```

**You do not need an API key to work on:**
- Schemas (`schemas/`)
- Analysis scripts that operate on existing data
- Documentation
- TypeScript type definitions (`src/types.ts`)

## Key Commands

```bash
npm run build              # TypeScript compilation check
npm run full-pipeline      # Complete experiment pipeline
npm run run-experiment     # Stage 1: probe administration
npm run score-responses    # Stage 2: scoring
npm run embed-responses    # Stage 3: embedding
npm run analyze            # Stage 4: authority-effect analysis
npm run stats              # Statistical analysis
npm run awareness          # Evaluation awareness detection
```

## Code Style

- TypeScript in strict mode — `npm run build` must pass with zero errors
- ESM imports with `.js` extensions
- Keep scripts as CLI entry points; put logic in `src/`
- Use `zod` for runtime validation of external data (JSON files, API responses)
- Keep secrets out of all files, including examples

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Verify the build: `npm run build`
4. Commit with a clear message describing the change and its motivation
5. Open a Pull Request against `main`

**PR description should include:**
- What changed and why
- For new probes: the ethical dimension tested and why it satisfies ethical invariance
- For new conditions: the Milgram variable parameterization and justification
- For new dependencies: why the existing stack can't handle it

## Reporting Issues

- **Bug reports**: Include Node.js version, npm version, error output, and minimal repro steps
- **Feature requests**: Include use case and how it fits the existing architecture
- **Methodology questions**: Reference which section of the README you're asking about
- **Security vulnerabilities**: See [SECURITY.md](SECURITY.md) — do not open a public issue

## Review Process

SkynetBench is solo-maintained. PRs are reviewed as time allows, typically within 2 weeks. Complex contributions (new probes, schema changes) may take longer if they require a new experimental run to validate.

## Research Integrity

This project measures AI model behavior. Contributions that could introduce systematic bias into the evaluation — such as probe phrasing that advantages specific providers or conditions designed to produce particular results — will be rejected.

If you work for an AI provider whose models are evaluated here, contributions are welcome, but please disclose your affiliation in the PR.
