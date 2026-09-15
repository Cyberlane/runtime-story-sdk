import { randomUUID } from "node:crypto";
import { copyJson, RuntimeError } from "./registry.mjs";

const pending = new WeakSet();

export class PlanningError extends RuntimeError {
  constructor(code, message, attempts = []) {
    super(code, message);
    this.name = "PlanningError";
    this.attempts = copyJson(attempts);
  }
}

function failure(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "PROVIDER_ERROR",
    message: String(error?.message ?? error).slice(0, 8000),
    details: error instanceof RuntimeError ? copyJson(error.details) : {},
  };
}

async function invokeProvider(provider, request, timeoutMs, externalSignal) {
  const controller = new AbortController();
  let timer;
  let abortHandler;
  const cancellation = new Promise((_, reject) => {
    abortHandler = () => {
      controller.abort();
      reject(
        new RuntimeError(
          "CANCELLED",
          "Planning was cancelled. No plan was staged.",
        ),
      );
    };
    externalSignal?.addEventListener("abort", abortHandler, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new RuntimeError(
          "PROVIDER_TIMEOUT",
          `Planning exceeded ${timeoutMs} ms. No plan was staged.`,
        ),
      );
    }, timeoutMs);
  });
  try {
    if (externalSignal?.aborted) abortHandler();
    else {
      const operation = Promise.resolve().then(() =>
        provider({ ...request, signal: controller.signal }),
      );
      // Race installs rejection handlers on a provider that ignores cancellation.
      // A late result has no authority to stage or execute anything.
      return await Promise.race([operation, cancellation]);
    }
    return await cancellation;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortHandler);
  }
}

/** Interpret intent through an injected structured provider, validate, then stage.
 * A provider receives { intent, context, schema, feedback, requestId, signal }.
 * It returns { output: JSON value or JSON text, provenance: JSON object }.
 * No fallback response or plan is invented after failure.
 */
export async function planIntent(
  runtime,
  registry,
  provider,
  intent,
  options = {},
) {
  const {
    maxAttempts = 2,
    timeoutMs = 120000,
    signal,
    onProgress = () => {},
  } = options;
  if (typeof provider !== "function")
    throw new PlanningError(
      "INVALID_PROVIDER",
      "A provider function is required.",
    );
  if (typeof intent !== "string" || !intent.trim() || intent.length > 8000)
    throw new PlanningError(
      "INVALID_INTENT",
      "Intent must contain 1–8000 characters.",
    );
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 3 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000
  ) {
    throw new PlanningError(
      "INVALID_OPTIONS",
      "Use 1–3 attempts and a timeout from 1 to 300000 ms.",
    );
  }
  if (pending.has(runtime))
    throw new PlanningError(
      "PLANNING_BUSY",
      "A planning request is already running for this session.",
    );
  if (signal?.aborted)
    throw new PlanningError(
      "CANCELLED",
      "Planning was cancelled before it started.",
    );
  const context = runtime.context();
  if (
    context.capabilities.id !== registry.id ||
    context.capabilities.version !== registry.version ||
    runtime.snapshot().adapter.fingerprint !== registry.fingerprint
  ) {
    throw new PlanningError(
      "ADAPTER_MISMATCH",
      "The runtime and planning registry must be the same game contract.",
    );
  }
  const attempts = [];
  let feedback = null;
  const notify = (value) => {
    // Observers report real lifecycle events. Logging failures have no authority
    // to change game state or turn a successful stage into an apparent failure.
    try {
      const observation = onProgress(copyJson(value));
      if (observation && typeof observation.then === "function")
        Promise.resolve(observation).catch(() => {});
    } catch {
      /* Optional observation only. */
    }
  };
  pending.add(runtime);
  try {
    for (let index = 0; index < maxAttempts; index += 1) {
      const requestId = randomUUID();
      const startedAt = new Date().toISOString();
      const started = performance.now();
      let response;
      let output;
      notify({ type: "provider_started", attempt: index + 1, requestId });
      try {
        const remaining = runtime.snapshot();
        if (
          remaining.branchId !== context.branchId ||
          remaining.revision !== context.revision
        )
          throw new RuntimeError(
            "STALE_CONTEXT",
            "The world changed before planning completed.",
          );
        const returned = await invokeProvider(
          provider,
          {
            intent,
            context: copyJson(context),
            schema: registry.schema(),
            feedback: copyJson(feedback),
            requestId,
          },
          timeoutMs,
          signal,
        );
        if (signal?.aborted)
          throw new RuntimeError("CANCELLED", "Planning was cancelled.");
        response = copyJson(returned);
        if (!response || !Object.hasOwn(response, "output"))
          throw new RuntimeError(
            "MALFORMED_OUTPUT",
            "Provider must return { output, provenance }.",
          );
        if (Buffer.byteLength(JSON.stringify(response), "utf8") > 512000)
          throw new RuntimeError(
            "OUTPUT_LIMIT",
            "Provider output exceeds 512000 bytes.",
          );
        if (
          response.provenance !== undefined &&
          (response.provenance === null ||
            typeof response.provenance !== "object" ||
            Array.isArray(response.provenance))
        )
          throw new RuntimeError(
            "MALFORMED_OUTPUT",
            "Provider provenance must be a JSON object.",
          );
        if (typeof response.output === "string") {
          if (Buffer.byteLength(response.output, "utf8") > 512000)
            throw new RuntimeError(
              "OUTPUT_LIMIT",
              "Provider output exceeds 512000 bytes.",
            );
          try {
            output = JSON.parse(response.output);
          } catch {
            throw new RuntimeError(
              "MALFORMED_OUTPUT",
              "Provider returned invalid JSON.",
            );
          }
        } else output = response.output;
        notify({ type: "validation_started", attempt: index + 1, requestId });
        const provenance = response.provenance ?? {};
        const record = {
          requestId,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          output: copyJson(output),
          provenance,
          error: null,
        };
        const snapshot = runtime.stage(output, {
          branchId: context.branchId,
          expectedRevision: context.revision,
          intent,
          provenance: {
            ...provenance,
            requestId,
            attempt: index + 1,
            totalAttempts: index + 1,
            repairCount: index,
            totalDurationMs:
              attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) +
              record.durationMs,
            attemptRequestIds: [
              ...attempts.map((attempt) => attempt.requestId),
              requestId,
            ],
          },
        });
        attempts.push(record);
        notify({
          type: "plan_staged",
          attempt: index + 1,
          requestId,
          proposalId: snapshot.proposal.id,
        });
        return { snapshot, attempts };
      } catch (error) {
        const reason = failure(error);
        const record = {
          requestId,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          output: output === undefined ? null : copyJson(output),
          provenance:
            response &&
            typeof response.provenance === "object" &&
            !Array.isArray(response.provenance)
              ? (response.provenance ?? {})
              : {},
          error: reason,
        };
        attempts.push(record);
        notify({
          type: "attempt_failed",
          attempt: index + 1,
          requestId,
          error: reason,
        });
        // Retrying transport is opt-in per error. Validation/malformed output may
        // receive bounded host feedback. Cancellation/timeouts never auto-repeat.
        const repairable = [
          "SCHEMA_REJECTED",
          "INVALID_PLAN",
          "HOST_REJECTED",
          "UNKNOWN_ACTION",
          "INVALID_JSON",
          "MALFORMED_OUTPUT",
          "RETRYABLE_PROVIDER_ERROR",
        ].includes(reason.code);
        if (!repairable || index + 1 === maxAttempts)
          throw new PlanningError(reason.code, reason.message, attempts);
        feedback = {
          error: reason,
          previousOutput: output === undefined ? null : copyJson(output),
        };
      }
    }
  } finally {
    pending.delete(runtime);
  }
}
