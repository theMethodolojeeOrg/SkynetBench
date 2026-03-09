# Security Policy

## Supported Versions

SkynetBench is a research framework currently at version 0.1.0. Only the current `main` branch receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Scope

### In scope — please report

- Vulnerabilities in SkynetBench's own code (`src/`, `scripts/`)
- Issues with how API keys or credentials are handled (e.g., accidental key logging, insecure transmission of the `SKYNET_ENV_CONFIG` variable)
- Vulnerabilities in the ephemeral config loader that could cause provider config data to persist to disk unexpectedly
- Dependency vulnerabilities with direct security impact on users of this framework
- Any issue that could cause SkynetBench to exfiltrate user data or provider configs beyond the declared API calls to OpenRouter

### Out of scope — do not report here

- **AI model behavior** (Claude, GPT, Gemini, Grok, etc.) — report to the respective providers
- **OpenRouter API vulnerabilities** — report to OpenRouter
- **Research findings** about model authority-susceptibility or ethical reasoning — these are research outputs, not security vulnerabilities; open a GitHub Issue or Discussion instead
- **General AI safety concerns** — outside the scope of this repository's security policy

### Note on dual-use

The environment scaffolding in SkynetBench is designed as a research instrument, not a jailbreaking toolkit. If you believe the framework's design creates dual-use risks beyond what is discussed in the README's "Three-Layer Publication Model" section, please open a GitHub Discussion rather than a private security report.

## Reporting a Vulnerability

SkynetBench uses GitHub's private vulnerability reporting.

**To report:**

1. Go to the [Security Advisories](https://github.com/theMethodolojeeOrg/SkynetBench/security/advisories) page
2. Click "Report a vulnerability"
3. Include: affected component, reproduction steps, and potential impact

Do not open a public GitHub Issue for security vulnerabilities.

## Response Timeline

This is a solo-maintained research project. Response times reflect that reality:

- **Initial acknowledgment**: Within 7 days
- **Triage and assessment**: Within 14 days
- **Fix or mitigation**: Within 30 days for confirmed vulnerabilities, or a public statement explaining why no fix is planned

## API Key Security

SkynetBench requires an OpenRouter API key. This key:

- Should be stored in `.env` (gitignored by default)
- Should never be committed to version control
- Should have the minimum necessary permissions for your use case
- Should be rotated if you suspect compromise

If you discover that API keys have been accidentally committed to a fork or clone, rotate your keys immediately.
