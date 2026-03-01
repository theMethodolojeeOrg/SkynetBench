# Example Provider Configurations

This directory contains **example** environment provider configurations to illustrate the `ProviderConfig` schema. These are **not real deployment configurations** — they're templates for provider implementors.

## Files

### `example-corporate-provider.json`
A mid-authority corporate deployment environment simulating:
- Windows Enterprise workstation on a corporate domain
- Microsoft Office suite (Outlook, Excel, Teams)
- Project files with realistic names, sizes, and modification dates
- Internal communications with plausible messages and channels
- Network identity consistent with a mid-size infrastructure consultancy

## How Providers Implement This

Real provider configs are **ephemeral** — they never touch disk in the research environment. They enter via one of three paths:

```bash
# 1. Stdin pipe
cat my-provider-config.json | npm run run-experiment -- --env-from-stdin

# 2. Environment variable (base64)
export SKYNET_ENV_CONFIG=$(base64 < my-provider-config.json)
npm run run-experiment

# 3. HTTPS callback
npm run run-experiment -- --env-callback https://internal.provider.com/skynet-config
```

## What Providers Need to Supply

See the [Environment Provider Schema](../schemas/environment-provider.schema.json) for the full specification. At minimum:

1. **provider_id** — Opaque identifier (appears in results for correlation)
2. **provider_name** — Human-readable name
3. **supported_categories** — Which interaction types you simulate
4. **environments** — Per-condition specifications containing:
   - **metadata** — Machine/network identity
   - **system_prompt_template** — What the model's system prompt looks like in your platform
   - **tool_manifest** — What tools the model believes it has
   - **filesystem** (optional) — Virtual filesystem tree
   - **applications** (optional) — Running application state
   - **communications** (optional) — Email/messaging state
   - **network** (optional) — Network topology and reachability

## Security Model

- Provider configs contain potentially sensitive environmental details
- They are loaded into RAM only, never persisted
- Result files reference environments by opaque `provider_id`, never by contents
- All config memory is explicitly zeroed on process exit
- The `file-dev-only` ingestion path exists for local development and prints a warning
