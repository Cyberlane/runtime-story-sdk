import Ajv from "ajv";
import { createHash } from "node:crypto";

export class RuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = details;
  }
}

// Reject values which JSON would silently drop, stringify differently or execute.
// Callbacks are trusted host code. This boundary is not a JavaScript sandbox.
export function copyJson(value, path = "$", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new RuntimeError(
      "INVALID_JSON",
      `Expected finite, acyclic JSON at ${path}`,
    );
  }
  const array = Array.isArray(value);
  if (
    !array &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new RuntimeError(
      "INVALID_JSON",
      `Expected a plain JSON object at ${path}`,
    );
  }
  const result = array ? [] : {};
  const keys = Reflect.ownKeys(value).filter(
    (key) => !(array && key === "length"),
  );
  if (
    array &&
    (keys.length !== value.length || keys.some((key, i) => key !== String(i)))
  ) {
    throw new RuntimeError(
      "INVALID_JSON",
      `Expected a dense JSON array at ${path}`,
    );
  }
  ancestors.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new RuntimeError(
        "INVALID_JSON",
        `Accessors, symbols and hidden properties are not JSON at ${path}`,
      );
    }
    Object.defineProperty(result, key, {
      value: copyJson(descriptor.value, `${path}.${key}`, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(value);
  return result;
}

export function freezeJson(value) {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freezeJson(item);
    Object.freeze(value);
  }
  return value;
}

function invoke(callback, args, label) {
  let result;
  try {
    result = callback(...args.map((value) => freezeJson(copyJson(value))));
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(
      "HOST_REJECTED",
      `${label}: ${String(error?.message ?? error)}`,
      { callback: label },
    );
  }
  if (result && typeof result.then === "function") {
    // Observe a rejected async callback without allowing it to become a commit.
    Promise.resolve(result).catch(() => {});
    throw new RuntimeError(
      "ASYNC_CALLBACK",
      `${label} must be synchronous and perform no external effects`,
    );
  }
  return result;
}

function assertRule(callback, args, label) {
  if (invoke(callback, args, label) !== true) {
    throw new RuntimeError(
      "HOST_REJECTED",
      `${label} must return true or throw a descriptive error`,
    );
  }
}

function object(properties) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

/** Register a game's JSON schemas and pure, synchronous state reducers. */
export function createRegistry(definition) {
  if (
    !definition ||
    typeof definition !== "object" ||
    Array.isArray(definition)
  ) {
    throw new RuntimeError(
      "INVALID_ADAPTER",
      "A game definition object is required",
    );
  }
  const { id, version, actions, context, validateState, validatePlan } =
    definition;
  const maxSteps = definition.maxSteps ?? 32;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof version !== "string" ||
    !version.trim()
  ) {
    throw new RuntimeError(
      "INVALID_ADAPTER",
      "A stable game id and rule version are required",
    );
  }
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 256) {
    throw new RuntimeError(
      "INVALID_ADAPTER",
      "maxSteps must be an integer from 1 to 256",
    );
  }
  for (const [name, callback] of Object.entries({
    context,
    validateState,
    validatePlan,
  })) {
    if (typeof callback !== "function")
      throw new RuntimeError("INVALID_ADAPTER", `${name} callback is required`);
  }
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > 128) {
    throw new RuntimeError(
      "INVALID_ADAPTER",
      "Register between 1 and 128 actions",
    );
  }
  const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
  function compile(schema, label) {
    try {
      const validator = ajv.compile(copyJson(schema));
      if (validator.$async) throw new Error("Async schemas are not supported");
      return validator;
    } catch (error) {
      throw new RuntimeError("INVALID_SCHEMA", `${label}: ${error.message}`);
    }
  }
  function check(validator, data, label) {
    if (!validator(data)) {
      throw new RuntimeError(
        "SCHEMA_REJECTED",
        `${label} does not match its registered schema`,
        {
          errors: copyJson(validator.errors),
        },
      );
    }
  }
  const stateSchema = copyJson(definition.stateSchema);
  const termsSchema = copyJson(definition.termsSchema);
  const checkState = compile(stateSchema, "stateSchema");
  compile(termsSchema, "termsSchema");
  const registry = new Map();
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new RuntimeError(
        "INVALID_ADAPTER",
        "Every action must be a definition object",
      );
    }
    if (
      typeof action.id !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(action.id) ||
      registry.has(action.id)
    ) {
      throw new RuntimeError(
        "INVALID_ADAPTER",
        `Invalid or duplicate action id: ${action.id}`,
      );
    }
    if (
      typeof action.description !== "string" ||
      !action.description.trim() ||
      typeof action.reduce !== "function"
    ) {
      throw new RuntimeError(
        "INVALID_ADAPTER",
        `${action.id} requires a description and reducer`,
      );
    }
    const parameters = copyJson(action.parameters);
    registry.set(action.id, {
      id: action.id,
      description: action.description,
      parameters,
      reduce: action.reduce,
      validateArguments: compile(parameters, `${action.id}.parameters`),
    });
  }
  const text = { type: "string", maxLength: 4000 };
  const planSchema = object({
    status: { type: "string", enum: ["ready", "unsupported", "needs_context"] },
    title: text,
    interpretation: text,
    question: text,
    terms: { anyOf: [termsSchema, { type: "null" }] },
    steps: {
      type: "array",
      maxItems: maxSteps,
      items: {
        anyOf: [...registry.values()].map((action) =>
          object({
            action: { type: "string", const: action.id },
            arguments: action.parameters,
            description: text,
          }),
        ),
      },
    },
  });
  const checkPlan = compile(planSchema, "plan");
  const description = {
    id,
    version,
    maxSteps,
    stateSchema,
    termsSchema,
    actions: [...registry.values()].map(({ id, description, parameters }) => ({
      id,
      description,
      parameters,
    })),
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(description))
    .digest("hex");

  function state(value) {
    const copy = copyJson(value);
    check(checkState, copy, "State");
    assertRule(validateState, [copy], "validateState");
    return copy;
  }

  function plan(value) {
    const copy = copyJson(value);
    check(checkPlan, copy, "Plan");
    if (copy.status !== "ready") {
      if (copy.steps.length !== 0 || copy.terms !== null) {
        throw new RuntimeError(
          "INVALID_PLAN",
          "A non-ready result must have no steps and null terms",
        );
      }
    } else if (
      copy.terms === null ||
      copy.steps.length === 0 ||
      copy.question !== ""
    ) {
      throw new RuntimeError(
        "INVALID_PLAN",
        "A ready plan requires terms, at least one step and no question",
      );
    }
    return copy;
  }

  function execute(value, step, terms, history = []) {
    const before = state(value);
    const command = copyJson(step);
    const action = registry.get(command.action);
    if (!action)
      throw new RuntimeError(
        "UNKNOWN_ACTION",
        `Action is not registered: ${command.action}`,
      );
    check(
      action.validateArguments,
      command.arguments,
      `${action.id} arguments`,
    );
    // Full plan validation belongs to simulate. This primitive executes a single
    // registered reducer and validates every resulting state invariant.
    const output = copyJson(
      invoke(
        action.reduce,
        [before, command.arguments, terms, history],
        `${action.id}.reduce`,
      ),
    );
    if (
      !output ||
      !Object.hasOwn(output, "state") ||
      !Object.hasOwn(output, "result")
    ) {
      throw new RuntimeError(
        "INVALID_RESULT",
        `${action.id}.reduce must return { state, result }`,
      );
    }
    return { state: state(output.state), result: copyJson(output.result) };
  }

  function simulate(value, candidate, history = []) {
    const before = state(value);
    const proposal = plan(candidate);
    if (proposal.status !== "ready")
      return { plan: proposal, state: before, results: [], transitions: [] };
    let after = before;
    const results = [];
    const transitions = [];
    for (const [index, step] of proposal.steps.entries()) {
      try {
        const outcome = execute(after, step, proposal.terms, history);
        after = outcome.state;
        results.push(outcome.result);
        transitions.push(copyJson(outcome));
      } catch (error) {
        if (error instanceof RuntimeError)
          error.details = {
            ...error.details,
            stepIndex: index,
            action: step.action,
          };
        throw error;
      }
    }
    assertRule(
      validatePlan,
      [{ before, after, plan: proposal, history }],
      "validatePlan",
    );
    return { plan: proposal, state: after, results, transitions };
  }

  return Object.freeze({
    id,
    version,
    fingerprint,
    describe: () => copyJson(description),
    schema: () => copyJson(planSchema),
    context: (value, history = []) =>
      copyJson(invoke(context, [state(value), history], "context")),
    validateState: state,
    validatePlanShape: plan,
    simulate,
    execute,
  });
}
