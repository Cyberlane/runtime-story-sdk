# JavaScript, Node and browser integration

This is the shortest path from a new clone to your own mechanics. The SDK runs on Node 22.12+. A browser game, Phaser scene, Three.js view or custom canvas client talks to a game-owned HTTP host. The browser does not import the Node package or receive model credentials.

## 1. Run the small example

Complete [Quickstart installation](../QUICKSTART.md#1-install-the-repository), then run from the repository root:

```sh
node docs/integrations/snippets/first-plan.mjs
```

It repairs a generator, switches it on, verifies duplicate command replay and resumes its checkpoint. No login is needed because the first candidate is authored. Keep these files open beside each other:

| File                                      | Your game supplies                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| [generator.mjs](snippets/generator.mjs)   | State, terms, registered actions, reducers, state invariants and final conditions |
| [first-plan.mjs](snippets/first-plan.mjs) | Session lifecycle: stage, show, accept, step, save and resume                     |
| [live-plan.mjs](snippets/live-plan.mjs)   | Model call plus explicit terminal acceptance and execution controls               |

## 2. Understand the game adapter

`createRegistry` takes a stable `id`, a rule `version`, JSON Schemas and trusted callbacks. The generator starts with one fuse, broken equipment and no power.

`stateSchema` defines what can exist in your simulation. `termsSchema` defines the outcome a player can agree to. `actions` defines the supported vocabulary. Each action has an ID, a description for the planner, a parameters schema and `reduce(state, arguments, terms, history)` returning `{ state, result }`.

In this example, `repair_generator` consumes the fuse and repairs the equipment. `switch_power` changes the power setting only after repair. `validateState` enforces fuse conservation and prevents power on broken equipment. `validatePlan` verifies the final power state against the proposed terms. `context` projects relevant state and human-readable rules for the planner.

Read [the full adapter](snippets/generator.mjs) before adding a third action. The exported values are ordinary JavaScript objects and functions. There is no registration decorator, inheritance hierarchy, engine plugin or generated source to maintain.

To add a mechanic to your game:

1. Define the minimum canonical state it needs in `stateSchema` and your initial state.
2. Add a stable action ID and a strict JSON parameters schema.
3. Implement a synchronous reducer returning a **new state and result**. Reject impossible preconditions with `RuntimeError('HOST_REJECTED', message)`.
4. Check invariants that must hold after every action in `validateState`.
5. Check the agreed final outcome in `validatePlan`.
6. Explain capabilities and constraints in `context` without leaking facts this planner should not see.
7. Increment the adapter rule `version` whenever reducer or rule behavior changes. Existing saves use that identity to reject incompatible adapters.
8. Test the valid sequence and meaningful rejected cases before involving a model. Use `registry.simulate(state, candidate)` to inspect a whole candidate without committing it.

Callbacks receive frozen JSON copies. Mutating them is an error. They cannot use asynchronous APIs. Keep file writes, native physics and animation outside the reducers because validation also runs them speculatively. [Host ownership](HOST.md#who-owns-what) explains the boundary.

## 3. Let OpenAI compose the plan

Configure a provider using the [Quickstart](../QUICKSTART.md#configure-a-live-provider), then run:

```sh
node --env-file-if-exists=.env docs/integrations/snippets/live-plan.mjs
```

Type `Restore power to the generator.`. The terminal prints the returned proposal. Type `yes` to accept it, then `yes` for each action you want to execute. Any other answer stops execution. The process keeps this tutorial session only in memory.

The core call in [live-plan.mjs](snippets/live-plan.mjs) is:

```js
import { createRuntime, planIntent } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";

const runtime = createRuntime(registry, initialState);
const provider = new StructuredProvider();
await planIntent(
  runtime,
  registry,
  (request) => provider.generate(request),
  intent,
);
```

`planIntent` receives your current projected state, capabilities and player intention. It validates model output and simulates the candidate before staging it. A ready proposal is still only a proposal. Display `snapshot.proposal.plan`, including its terms and steps, and obtain acceptance before calling `runtime.accept`. Obtain the next action from the accepted plan and pass its exact `planId`/`stepId` to `runtime.step`. The live example implements the entire sequence.

An `unsupported` or `needs_context` proposal has no executable steps. Display the interpretation/question and allow another request. Provider failures throw a coded error and preserve attempt diagnostics. Read fresh state after stale-context errors. Do not automatically turn a rejected plan into a successful animation.

## 4. Connect a browser UI to the sample host

```sh
npm run demo:relay-station
```

Open `http://127.0.0.1:4330`. Its [complete browser UI](../../examples/relay-station/index.html) and [Node server](../../examples/relay-station/server.mjs) are a runnable example. They already implement editable intent, proposal review, acceptance, one-action execution and local checkpoints. Start by changing their presentation, then replace [game.mjs](../../examples/relay-station/game.mjs) with your adapter.

The following complete functions can be used in a same-origin browser module. Your existing buttons call them. Await each operation and disable buttons while it runs. Display errors in your UI. Do not run this alongside the sample UI's own command handlers without coordinating state.

```js
let snapshot;
let lastStepCommand;

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (result.snapshot) snapshot = result.snapshot;
  if (!response.ok || result.error) {
    throw new Error(
      result.error?.message ??
        JSON.stringify(result.error) ??
        `HTTP ${response.status}`,
    );
  }
  return result;
}

function guard() {
  if (!snapshot) throw new Error("Refresh state first.");
  return { branchId: snapshot.branchId, expectedRevision: snapshot.revision };
}

async function refresh() {
  return request("/state");
}
async function propose(intent) {
  return request("/propose", { ...guard(), intent });
}
async function accept() {
  if (snapshot?.proposal?.plan?.status !== "ready")
    throw new Error("Review a ready proposal first.");
  return request("/accept", { ...guard(), proposalId: snapshot.proposal.id });
}
async function executeNext() {
  const plan = snapshot?.plans.find((item) => item.status === "active");
  if (!plan) throw new Error("Accept a plan first.");
  lastStepCommand = {
    ...guard(),
    planId: plan.id,
    stepId: plan.stepIds[plan.nextStep],
  };
  return request("/step", lastStepCommand);
}
async function retryExactStep() {
  if (!lastStepCommand) throw new Error("No previous step command.");
  return request("/step", lastStepCommand);
}
```

Call `await refresh()` on initial load. After each successful call, render `snapshot.state`. After `propose`, also render `snapshot.proposal.plan`. Use DOM `textContent` for model text, never `innerHTML`. Animate an execution only when its returned receipt is confirmed, and avoid replaying one-shot effects when `execution.replayed` is true.

For Phaser or Three.js, bind these functions to your input layer and use confirmed JSON state to update scene objects. The SDK does not require a rendering framework. The supplied browser games demonstrate plain DOM/canvas rendering. No Phaser-specific build is claimed.

## 5. Save, revise and install outside the repository

Save the full `snapshot`, not only `snapshot.state`. The [host guide](HOST.md#checkpoints-and-process-restarts) explains rollback versus restart and crash-durability limits. For world events and revised plans, follow [replanning](HOST.md#replanning-after-a-world-change).

To use the SDK in a separate Node host project, build a local npm tarball:

```sh
npm pack --workspace=@off-script/runtime-story
```

That creates `off-script-runtime-story-0.2.0.tgz` in the current directory. From your other Node project's directory, run `npm install /absolute/path/to/off-script-runtime-story-0.2.0.tgz`, using the actual path printed by your package build. Import the same public module name. The npm package contains the SDK and its license, not the demos or an engine server. Registry publication is a separate operation and is not required to consume the local package.

Before shipping, test authentication, persistence and concurrency for your own host. The package's [API and limitations](../../packages/runtime-story/README.md) are the source of truth for this version.
