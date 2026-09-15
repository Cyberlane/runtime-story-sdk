# Contributing

Use Node.js 22.12+ and run `npm ci` from the repository root.

The SDK lives in `packages/runtime-story`. Game rules and presentation belong under `examples/`. Keep this boundary: a generic runtime must not import a particular demo's assets, state shape or character names.

For a code change:

1. Reproduce the behavior and make the smallest coherent fix.
2. Add a regression test for changed behavior or a previously uncovered failure boundary. Avoid tests that only repeat implementation details.
3. Run `npm run check` and `npm run format:check`.
4. Run the affected demo and inspect its actual behavior. Document whether engine verification was native or source-only.
5. Explain the problem, resulting behavior and validation in the pull request.

Use `npm run format` to format supported source and Markdown files. Keep comments for non-obvious contracts and reasons. Prefer plain functions and existing boundaries over new abstraction layers.

Reducers must be pure and synchronous. State and receipts must stay together. Exact retries must never become a newly computed next-step command. Do not weaken a validation rule to make a fixture pass.

For new images, retain useful public-safe provenance, include only selected assets, update the relevant manifest and run `npm run art:check`. Never add credentials, local handoffs, private captures or discarded assets. New dependencies need an explicit purpose and license notice.

Contributions are accepted under the repository's MIT license. Only contribute material you are entitled to license. Open a focused issue or pull request on GitHub; no special contributor tooling is required.
