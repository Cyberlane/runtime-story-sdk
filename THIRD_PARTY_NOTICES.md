# Third-party notices

The project's MIT license does not replace the licenses of dependencies or development tools. npm installs the following SDK dependency graph from the locked package versions.

| Component                                                                   | Role                       | License and notice                                                                            |
| --------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| [Ajv](https://github.com/ajv-validator/ajv)                                 | JSON Schema validation     | [MIT](docs/licenses/ajv.txt)                                                                  |
| [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal)           | Ajv dependency             | [MIT](docs/licenses/fast-deep-equal.txt)                                                      |
| [fast-uri](https://github.com/fastify/fast-uri)                             | Ajv dependency             | [BSD-3-Clause](docs/licenses/fast-uri.txt)                                                    |
| [json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse) | Ajv dependency             | [MIT](docs/licenses/json-schema-traverse.txt)                                                 |
| [require-from-string](https://github.com/floatdrop/require-from-string)     | Ajv dependency             | [MIT](docs/licenses/require-from-string.txt)                                                  |
| [Prettier](https://github.com/prettier/prettier)                            | Development-only formatter | [MIT](docs/licenses/prettier.txt); its installed package contains notices for bundled parsers |

Node.js, npm, browsers and the optional Codex CLI are installed separately. Godot, Unity and Unreal are optional integration targets; this repository contains our example client source, not those engines. Their own distribution and service terms apply. OpenAI services require your own account and applicable service agreement; no API credentials or model weights are distributed.

Generated original assets and AI-assisted development are disclosed in [credits](docs/CREDITS.md). The repository does not bundle the externally hosted submission video's audio or Apple General MIDI bank. Historical private prototype dependencies and discarded 3D studies are not part of this distribution.

## Website fonts

Barlow and Barlow Condensed by Jeremy Tribby are bundled locally in the static site under the [SIL Open Font License 1.1](site/assets/fonts/OFL.txt). See [site provenance](site/art-direction/PROVENANCE.md) for the exact source and selected files.
