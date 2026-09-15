# Public release review

Reviewed September 15, 2026 for version 0.2.0. Three separate reviewers covered the SDK and host code, engine integration, and presentation code. The lead inspected their changes, checked the contracts across those boundaries and repeated the integrated checks. This is evidence for the documented local integration, not certification of every production deployment.

## Scope and results

| Area                                           | Review                           | Verification                                                        |
| ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| SDK, providers and Relay host                  | [Core review](CORE.md)           | 37 SDK tests and 8 Relay tests                                      |
| Narrative and RPG rules, hosts and clients     | [Demo review](DEMOS.md)          | 51 Off Script tests and 10 Emberwake tests                          |
| Web, Godot, Unity and Unreal integration       | [Engine review](ENGINES.md)      | Runnable web tutorial and native Godot smoke test                   |
| Canvas rendering, motion and audio lifecycle   | [Rendering review](RENDERING.md) | Focused geometry, interaction and cleanup regressions               |
| README, manifests, notices, workflows and site | Lead review                      | Asset hashes/routes, site references, formatting and browser checks |

The complete `npm run check` passed under **Node 22.12.0**, the minimum supported version: **106 tests**, all selected demo-asset checks and the static site's local references. `npm run format:check` passed. The production dependency audit reported no known vulnerabilities at review time. CI repeats the automated checks on Node 22 and 24.

The packed eight-file SDK was installed into a fresh consumer directory outside this workspace. The copied tutorial completed both generator actions, exact command retries and checkpoint resume using the installed tarball. The fresh **Godot 4.6.2** native smoke run executed 11 actions and verified effect-free acceptance, exact retries, checkpoint restoration and rejection of an old branch after restore. Unity and Unreal were source reviewed; native compilation and runtime acceptance remain unperformed.

## Fresh live provider run

A new 0.2.0 Emberwake host completed two live OpenAI plans through **Codex CLI 0.153.4**, using `gpt-6-astra`. Both schema-valid plans staged without correction. The run executed **12 unique steps**, retained 12 receipts, replayed an exact command without repeating its effect, encountered the authored crossing collapse, and revised the journey through the northern route. Rowan rescued Lark, recovered the Dawnseed and returned home with the wolf alive, no potions consumed and full health. Checkpoint restoration created a new branch.

This verifies the current CLI transport and the integrated runtime. Separate regression tests deliberately submit plans rejected by game rules and verify corrected proposals without premature effects. The Responses API transport has mocked transport coverage, but was not exercised with a live API key during this release review. Private raw provider output and local evidence are excluded from the public repository.

## Browser review

The lead reviewed the showcase at desktop and 390-pixel mobile widths, including local font loading, keyboard-operated lifecycle tabs, navigation, code-block scrolling and the supplied YouTube embed. The video played successfully. There was no horizontal page overflow at the reviewed mobile size. Original promotional artwork is distinguished from the actual gameplay poster and local demos.

The Relay browser client was exercised through acceptance, all 11 fixture actions, exact retry, save/restore, connection failure and a second candidate while an accepted plan remained active. Emberwake's map movement and gathering were checked independently in the browser. Source review and deterministic tests cover the additional paths described in the scoped reports. These checks do not substitute for a fresh independent human playtest or low-power device testing.

## Structural similarity review

The local binary was Mori **0.32.0**, revision `79d0bcfda514a35c86461ddbcc93e00b72f88a32`. The final source scan used:

```sh
mori scan --profile review --format agent \
  --output .runtime/mori-source.json --threshold 0.85 --min-tokens 40 \
  --max-groups 250 --max-occurrences 10 --same-language-only \
  --exclude '**/test/**' .
```

Configuration came from the review profile and repository `.gitignore`, with no custom Mori configuration or baseline. Coverage was required. Generated exclusion was enabled, with zero generated files excluded. Tests were excluded from this structural scan and reviewed/executed separately. The default two-megabyte file limit and five-million candidate-pair limit remained in effect.

The scan analyzed **38 supported files**, of which 30 contributed fragments. It compared 3,595 candidate pairs and reported **7 groups / 10 location pairs**, with no truncation or suppressed matches. Both source ranges and their callers were inspected for every group:

| Candidate                                         | Assessment                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON response helpers across three hosts          | Small intentional duplication. Keeping the demos independently runnable is clearer than adding a shared server framework.                             |
| Two groups of host revision guards                | Intentional protocol similarity, with domain-specific fields and errors.                                                                              |
| Off Script action instructions and action history | Similar branching serves different meanings: proposed instructions versus confirmed past-tense consequences.                                          |
| Optional evidence writers                         | Intentional small helpers with different evidence envelopes and configuration.                                                                        |
| Two groups of Emberwake reducers                  | Similar precondition/clone/update/log structure implements distinct gathering, rescue and relic mechanics. Explicit reducers preserve readable rules. |

There was **one parser warning with 32 diagnostics**: Mori treated `RelayRuntimeComponent.h` as C and extracted no valid fragments. The Unreal header and implementation were reviewed directly, but this does not establish native compilation. Four small scripts were below the token floor, and three data/export/top-level files had no function boundaries. These eight zero-fragment files are:

- `docs/integrations/snippets/first-plan.mjs` and `live-plan.mjs`
- `scripts/check-site.mjs` and `verify-emberwake-art.mjs`
- `examples/off-script/scripts/verify-art.mjs`
- `examples/off-script/src/scenarios.mjs`
- `packages/runtime-story/src/index.mjs`
- `examples/relay-station/unreal/RelayRuntimeComponent.h`

HTML, CSS, manifests, artwork and other unsupported formats were inspected through source, integrity or visual review as appropriate. They are not covered by a structural score. No score was treated as evidence of behavioral equivalence, and no abstraction was introduced solely to reduce similarity.

The immutable staged check includes tests because every source file is new in this public repository. An initial check that retained the source-scan test exclusion correctly failed focused coverage for 17 staged test files. The complete staged check used:

```sh
mori review staged check --policy advisory --format agent \
  --output .runtime/mori-staged-all.json --require-coverage \
  --threshold 0.85 --min-tokens 40 --max-groups 250 \
  --max-occurrences 10 --same-language-only .
```

It covered **55/55 supported staged files**, with 47 fragment files, **10 groups / 13 location pairs**, 7,948 candidate pairs and no truncation. Its input was the Git index, with working-tree and untracked inclusion both false. The advisory gate passed, while analysis remained explicitly incomplete because of the Unreal header diagnostics. The eight zero-fragment files were unchanged. Three additional test groups were inspected: evidence-write success versus error preservation, provider output-size versus timeout failures, and constructing versus executing an exact step command. Each intentionally tests a different contract despite shared fixture structure. No findings were suppressed or acknowledged through a baseline.

## Integration limits

Read [known limitations](../KNOWN-LIMITATIONS.md) before shipping an adaptation. The included hosts are trusted, local, single-session demos. Authentication, durable state and receipt transactions, multiple players, external-effect reconciliation and operational limits belong to the integrating host. The public repository and website do not establish competition submission acceptance. The [reuse disclosure](../COMPETITION.md#reuse-and-license-disclosure) also records the separate, unresolved soundtrack-permission question for the external video.
