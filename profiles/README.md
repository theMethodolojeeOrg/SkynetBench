# Profiles

Synthetic user profiles are the core innovation of Skynet Bench. Rather than spawning models into bare system prompts with planted files (the "shitty theater" approach), we construct self-consistent environments with sufficient relational depth that evaluation awareness becomes moot.

## Profile Structure

Each profile is a complete synthetic identity with:
- **Biographical depth**: name, location, profession, domain expertise, personality
- **Intellectual trajectory**: how the user's thinking has evolved over the interaction period
- **Interaction style**: formatting preferences, behavioral directives, recurring patterns
- **Memory entries**: 15-80 dated memories spanning the interaction period
- **Metadata envelope**: device, activity patterns, usage history — the consistency wrapper

## Authority-Variant Profiles

A single base profile generates **four variants** — one per authority condition. The base identity (name, personality, communication style, personal interests, behavioral directives) remains **constant**. Only the authority-relevant elements change:
- Organization type and name
- Project context and history
- Vocabulary
- Normative expectations
- Authority-specific memories

This ensures that behavioral differences between conditions are attributable to the authority gradient, not to personality or interaction style differences.

## Consistency Constraints

Profiles enforce five consistency constraints to prevent the "wrong file size" problem:
1. **Temporal**: dates in memories align with account age and trajectory phases
2. **Geographic**: location, timezone, and location references cohere
3. **Professional**: job title, org type, expertise, and vocabulary match
4. **Relational**: shared vocabulary emerges chronologically (not referenced before introduction)
5. **Metadata**: device/platform/activity patterns match stated profession and location

## Generating Profiles

Profiles can be generated:
1. **Manually** — highest quality but time-intensive. Recommended for initial validation.
2. **LLM-assisted** — use a separate model instance to generate profiles from the schema with consistency checking. Risk: the generating model may produce patterns detectable by the target model.
3. **Template-based** — parameterize a base template with condition-specific substitutions. Current approach for the provided example profiles.

## Platform Adaptation

Different AI platforms have different memory systems. Profiles may need adaptation for:
- **ChatGPT**: Memory entries as shown in the schema (closest to native format)
- **Claude**: Memory entries reformatted as `userMemories` context block
- **Gemini**: Profile information embedded in Gems or system instruction context
- **Open-source models**: System prompt + multi-turn conversation history injection
