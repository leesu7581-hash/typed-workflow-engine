import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflow, type WorkflowDefinition } from "../src/index.ts";

type State = "cart" | "checkout" | "paid";
type Context = { items: number; paymentId?: string };
type Event =
  | { type: "ADD_ITEM"; amount: number }
  | { type: "CHECKOUT" }
  | { type: "PAY"; paymentId: string };

const definition: WorkflowDefinition<Context, State, Event> = {
  initial: { state: "cart", context: { items: 0 }, revision: 0 },
  states: ["cart", "checkout", "paid"],
  transitions: {
    cart: {
      ADD_ITEM: {
        to: "cart",
        reduce: (context, event) => ({
          ...context,
          items: context.items + event.amount,
        }),
      },
      CHECKOUT: {
        to: "checkout",
        guard: (context) => context.items > 0,
      },
    },
    checkout: {
      PAY: {
        to: "paid",
        reduce: (context, event) => ({
          ...context,
          paymentId: event.paymentId,
        }),
      },
    },
  },
};

test("moves through valid transitions and records immutable history", () => {
  const workflow = createWorkflow(definition, {
    clock: () => "2026-10-13T00:00:00.000Z",
  });

  assert.equal(workflow.send({ type: "ADD_ITEM", amount: 2 }).ok, true);
  assert.equal(workflow.send({ type: "CHECKOUT" }).ok, true);
  assert.equal(workflow.send({ type: "PAY", paymentId: "pay_123" }).ok, true);

  assert.deepEqual(workflow.snapshot(), {
    state: "paid",
    context: { items: 2, paymentId: "pay_123" },
    revision: 3,
  });
  assert.deepEqual(workflow.history().map(({ from, to }) => ({ from, to })), [
    { from: "cart", to: "cart" },
    { from: "cart", to: "checkout" },
    { from: "checkout", to: "paid" },
  ]);
});

test("rejects a transition when its guard fails without mutating state", () => {
  const workflow = createWorkflow(definition);
  const result = workflow.send({ type: "CHECKOUT" });

  assert.deepEqual(result, {
    ok: false,
    code: "GUARD_REJECTED",
    state: "cart",
    message: "Guard rejected CHECKOUT from cart",
  });
  assert.equal(workflow.snapshot().revision, 0);
  assert.equal(workflow.history().length, 0);
});

test("returns a typed failure for an event that is invalid in the current state", () => {
  const workflow = createWorkflow(definition);
  const result = workflow.send({ type: "PAY", paymentId: "too_early" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "UNKNOWN_EVENT");
});

test("serializes and restores a workflow", () => {
  const first = createWorkflow(definition);
  first.send({ type: "ADD_ITEM", amount: 1 });
  first.send({ type: "CHECKOUT" });

  const restored = createWorkflow(definition, { restored: first.serialize() });
  restored.send({ type: "PAY", paymentId: "pay_restored" });

  assert.equal(restored.snapshot().state, "paid");
  assert.equal(restored.snapshot().revision, 3);
  assert.equal(restored.history().length, 3);
});

test("refuses snapshots with states unknown to the definition", () => {
  assert.throws(
    () => createWorkflow(definition, {
      restored: {
        snapshot: { state: "missing" as State, context: { items: 0 }, revision: 1 },
        history: [],
      },
    }),
    /Cannot restore unknown state/,
  );
});
