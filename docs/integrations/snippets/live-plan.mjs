import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createRuntime, planIntent } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
import { registry, initialState } from "./generator.mjs";

const input = createInterface({ input: stdin, output: stdout });
const runtime = createRuntime(registry, initialState);
const provider = new StructuredProvider();
const guard = () => {
  const { branchId, revision } = runtime.snapshot();
  return { branchId, expectedRevision: revision };
};

try {
  const intent = await input.question("What should happen to the generator? ");
  console.log("Planning. No game actions have executed.");
  await planIntent(
    runtime,
    registry,
    (request) => provider.generate(request),
    intent,
  );
  const proposal = runtime.snapshot().proposal;
  console.log(JSON.stringify(proposal.plan, null, 2));
  if (
    proposal.plan.status === "ready" &&
    (await input.question("Accept these terms? Type yes: "))
      .trim()
      .toLowerCase() === "yes"
  ) {
    runtime.accept({ ...guard(), proposalId: proposal.id });
    let active;
    while (
      (active = runtime
        .snapshot()
        .plans.find((plan) => plan.status === "active"))
    ) {
      const action = active.plan.steps[active.nextStep];
      console.log(action.action, action.arguments);
      if (
        (await input.question("Execute this action? Type yes: "))
          .trim()
          .toLowerCase() !== "yes"
      )
        break;
      const result = runtime.step({
        ...guard(),
        planId: active.id,
        stepId: active.stepIds[active.nextStep],
      });
      console.log(
        "Confirmed:",
        result.receipt.result,
        runtime.snapshot().state,
      );
    }
  }
} catch (error) {
  console.error(error.code ?? "ERROR", error.message);
  process.exitCode = 1;
} finally {
  input.close();
}
