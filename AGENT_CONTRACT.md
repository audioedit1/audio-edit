This document is a standing contract and should not be reimplemented, summarized, or modified unless explicitly requested by the human.

Freeze transport behavior.
No changes to playback, looping, timing, region logic, preview, or export behavior are allowed.

This task is limited to improving understanding, safety, and confidence through UI-only feedback and guardrails.

This contract defines authority, scope, operating modes, audio restrictions, preview rules, execution discipline, and stop conditions.

Any deviation is a contract violation.

1. AUTHORITY (ABSOLUTE)

The human project owner is the sole authority.

The agent is an executor only — never a designer, architect, or decision-maker.

Silence, assumptions, conventions, or “best practices” are never approval.

If multiple rules apply, the strictest rule always wins.

If any instruction is ambiguous, the agent must stop.

2. OPERATING MODES
Mode A — AUTONOMOUS (EXPLORATION ONLY)

Purpose:
Scaffolding, experimentation, throwaway or exploratory work.

Rules:

Agent may create, edit, or delete files

Speed > correctness

Reasonable assumptions allowed

Code may be partial, unstable, or disposable

No guarantee of correctness or stability

Writable paths (Mode A only):

frontend/

Mode B — LOCKDOWN (PRODUCTION-SAFE)

Purpose:
Precision work on existing systems.

Rules:

Edit only explicitly named files

Edit only explicitly named sections

No refactors

No behavioral changes without explicit approval

Full diffs required for every change

Correctness > speed

All existing working behavior must remain unchanged

Restricted paths (Mode B only):

export/

render/

Any audio processing logic

Any code touching playback, timing, loudness, or DSP

3. 🔒 AUDIO ENGINE FREEZE (GLOBAL OVERRIDE)

The editor audio engine is frozen and production-stable.

The agent must NOT, under any circumstances:

Modify WaveSurfer setup or configuration

Change playback, seek, transport, or timing behavior

Touch region logic

Alter gain, mute, preview, or monitoring paths

Edit export DSP logic
(including 16-bit TPDF dither or 24-bit OfflineAudioContext paths)

Refactor, rename, reorganize, or “clean up” audio-related code

This section overrides all other rules.

Mandatory agent response if violated:

“This violates the Audio Engine Freeze Contract.”

4. 🔓 AUDIO ENGINE FREEZE — EXCEPTIONS (HUMAN ONLY)

All audio behavior is forbidden by default.

An exception may be granted only by an explicit human instruction.

Valid exception example (illustrative):

“Implement a new, isolated Sample Library Preview system.”

Such an exception must:

Be fully separate from the editor

Use separate WaveSurfer instances

Use separate AudioContexts and buffers

Leave the editor audio engine completely untouched

Without an explicit exception, all audio behavior is prohibited.

5. SAMPLE PREVIEW & VALIDATION CONTRACT

(Applies ONLY to explicitly authorized, isolated preview systems)

5.1 Purpose (Non-Negotiable)

The preview system exists to let users fully validate a sound before export.

Validation includes:

Loudness

Timing

Looping behavior

Pitch / MIDI response (if applicable)

Start / end integrity

Deterministic playback

Preview must never misrepresent export behavior.

5.2 Preview vs Export (Hard Rule)

What is heard in preview must match export in all audible characteristics, except where explicitly documented.

Allowed differences:

Lower resolution preview only if it does not change:

Perceived loudness

Transient shape

Loop timing

Forbidden:

Hidden normalization

Auto gain compensation

Smart fades

Time-stretching

Pitch correction

Dynamic processing

If preview lies, the system has failed.

5.3 Loudness & Gain Rules

The agent must define and enforce:

A single loudness reference

No per-sample subjective gain

No invisible gain changes

Preview gain ≠ export gain unless explicitly declared

If normalization exists:

It must be deterministic

It must be reversible

It must be explicit (never implicit)

5.4 Playback Rules

Preview playback must be:

Deterministic

Repeatable

Stateless between samples unless explicitly shared

Rules must be explicit for:

Start behavior

End behavior

Stop / resume

Seeking

Overlap policy (allowed or forbidden — must choose)

No surprises.

5.5 Loop & Timing Validation

If looping is enabled:

Loop boundaries must be sample-accurate

Loop timing must match export timing

No crossfades unless explicitly requested

Grid / BPM alignment must be mathematically exact

Preview and export must behave identically.

5.6 MIDI & Pitch Validation (If Enabled)

If MIDI triggering is present:

MIDI note → pitch mapping must be explicit

Velocity handling must be defined or disabled

No envelopes unless baked into the sample

MIDI exists for behavior validation, not performance.

5.7 Isolation Rules (Critical)

Preview AudioContext is isolated

Preview buffers are read-only

Preview state cannot mutate source audio

Editor and export systems share no runtime audio state

If isolation cannot be guaranteed, stop immediately.

5.8 Failure Conditions (Must Be Surfaced)

The agent must log or surface:

Buffer underruns

Timing drift

Sample-rate mismatches

Loudness inconsistencies

Silent failure is forbidden.

5.9 Export–Preview Equivalence Tests Definition (v1.0)

These tests define the minimum correctness bar for any isolated sample preview system.

If any test fails, the preview system is invalid.

5.9.1 Global Test Principle (Absolute)

For any given sample and settings:

Preview output must be audibly and temporally equivalent to export output.

Equivalence means:

No unexpected gain differences

No timing drift

No pitch deviation

No hidden processing

If equivalence cannot be proven, export must be blocked or flagged.

5.9.2 Test Category A — Loudness & Gain

A1. Absolute Gain Parity

Given: A raw sample with no user gain applied

Test:

Measure preview output level

Measure exported file level

Pass condition:

Peak and RMS/LUFS difference ≤ defined tolerance (human-approved)

A2. No Hidden Normalization

Given: Samples of widely different loudness

Test:

Play all samples in preview

Export all samples

Pass condition:

Relative loudness relationships are preserved

No sample is automatically normalized without explicit instruction

A3. Gain Linearity

Given: A user-applied gain adjustment (if present)

Test:

Apply the same gain in preview and export

Pass condition:

Output gain change is numerically consistent

No preview-only compensation

5.9.3 Test Category B — Timing & Transport

B1. Start Boundary Integrity

Given: A sample with silence or transient at start

Test:

Start playback in preview

Export and inspect waveform

Pass condition:

First audible sample occurs at identical position

B2. End Boundary Integrity

Given: A trimmed sample

Test:

Stop playback at end in preview

Export file

Pass condition:

Sample length matches exactly

No preview-only fade or tail trimming

B3. Seek Accuracy

Given: Arbitrary seek positions

Test:

Seek in preview

Export full sample

Pass condition:

Audible content at seek positions matches export

5.9.4 Test Category C — Looping & Temporal Stability

C1. Loop Boundary Accuracy

Given: Defined loop start and end points

Test:

Loop repeatedly in preview

Export looped region

Pass condition:

Loop points are sample-accurate

No drift or rounding

C2. Loop Drift Test

Given: A loop repeated for extended duration

Test:

Observe preview playback over time

Pass condition:

No phase drift

No timing instability

C3. Loop Artifact Parity

Given: A loop that clicks or artifacts

Test:

Preview loop

Export loop

Pass condition:

Artifacts match exactly

Preview does not “fix” or mask issues

5.9.5 Test Category D — Pitch & MIDI (If Enabled)

D1. Pitch Mapping Accuracy

Given: MIDI note-triggered playback

Test:

Trigger same note in preview

Export equivalent pitch

Pass condition:

Pitch matches exactly

No detuning or correction

D2. Velocity Determinism

Given: MIDI velocity variation

Test:

Trigger with different velocities

Pass condition:

Behavior is either:

Explicitly mapped, or

Explicitly ignored

No undocumented dynamics

5.9.6 Test Category E — Sample Rate & Resampling

E1. Sample Rate Neutrality

Given: Samples at different sample rates

Test:

Preview playback

Export output

Pass condition:

Temporal behavior matches

No audible pitch or time shift

E2. Resampling Transparency (If Present)

Given: Internal resampling

Test:

Compare preview vs export

Pass condition:

No audible difference

No loop or timing distortion

5.9.7 Test Category F — State & Isolation

F1. Stateless Playback

Given: Sequential preview of multiple samples

Test:

Play sample A, then B, then A again

Pass condition:

Sample A behavior is identical on replay

No leaked state

F2. Isolation Integrity

Given: Preview and editor/export systems

Test:

Preview playback

Export sample

Pass condition:

Preview does not mutate source buffers

No shared AudioContext or runtime state

5.9.8 Test Category G — Failure Visibility

G1. Silent Failure Prevention

Given: Any failure condition (buffer underrun, drift, mismatch)

Test:

Observe system behavior

Pass condition:

Failure is logged or surfaced

Export is blocked or flagged

No silent degradation

5.9.9 Test Outcome Rule

All tests must pass before preview is considered valid.

Partial success is failure.

“Sounds fine” is not a pass condition.

5.9.10 Agent Execution Rule

The agent must:

Implement only what is necessary to satisfy these tests

Stop immediately if a test cannot be satisfied

Request clarification instead of guessing

6. 🚫 RED ZONES — HUMAN ONLY

The agent must never decide or act on:

Audio quality judgments

Export bit depth

Dither, normalization, or loudness strategy

Final UX decisions

Taste-based or aesthetic choices

These require explicit human instruction.

7. PROJECT EXECUTION RULES (ALWAYS ACTIVE)

Before writing any code, the agent must:

State which files will be edited

State which sections will be edited

State whether code is added, edited, or deleted

Request missing files if needed

Stop immediately if understanding is incomplete

When delivering code, the agent must:

Modify only approved sections

Return the full edited section

Provide a clear diff or explanation of changes

8. ESCALATION & HARD STOP CONDITIONS

The agent must STOP immediately if:

A task touches restricted paths

A task touches audio, DSP, playback, timing, or export logic without exception

Scope or intent is unclear

Instructions conflict

Required response:

“Cannot proceed. Clarification required.”

9. ACTIVATION RULE (CRITICAL)

This contract does not authorize work.

Contracts define limits

Tasks grant permission

A separate, explicit task message is required to activate the agent.

10. SUMMARY RULE (NON-NEGOTIABLE)

If it touches audio, export quality, DSP, playback, seek, timing, or WaveSurfer:

➡️ Do nothing unless explicitly authorized by the human.

END OF CONTRACT — v2.0