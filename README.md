# Typed Workflow Engine

A tiny TypeScript state-transition engine for predictable multi-step workflows.

It keeps business rules outside UI components, rejects invalid transitions without mutation, records an immutable audit trail, and can restore serialized workflows.

## Why this exists

Multi-step forms and approval flows often begin as scattered booleans:

```ts
isSubmitted && !isApproved && !hasError
```

That makes impossible states easy to create. This package replaces those combinations with explicit states and allowed events.

```text
draft ──SUBMIT──▶ in_review ──APPROVE──▶ approved
                         └────REJECT────▶ rejected
```

## Features

- Strict TypeScript API with discriminated-union events
- Explicit transition table
- Guards that reject transitions without changing state
- Reducers that update context separately from presentation code
- Immutable snapshots and transition history
- Serialization and restoration
- No runtime dependencies

## Example

```ts
import { createWorkflow } from "@leesu/typed-workflow-engine";

const order = createWorkflow({
  initial: { state: "cart", context: { items: 1 }, revision: 0 },
  states: ["cart", "checkout", "paid"],
  transitions: {
    cart: {
      CHECKOUT: {
        to: "checkout",
        guard: (context) => context.items > 0,
      },
    },
    checkout: {
      PAY: { to: "paid" },
    },
  },
});

order.send({ type: "CHECKOUT" });
order.send({ type: "PAY" });
console.log(order.snapshot());
```

For a fully typed event union, see [`examples/review-flow.ts`](./examples/review-flow.ts).

## Design decisions

### Failed transitions are values

User-driven invalid events are expected, so `send` returns a discriminated result instead of throwing. Definition and restoration errors throw because they indicate programmer or persistence errors.

### State and context are separate

The state describes where the workflow is. Context stores domain data. UI components can render the snapshot without owning the business rules.

### History is append-only

Successful transitions record their origin, destination, event, resulting context, revision, and timestamp. Rejected transitions do not alter history.

## Development

```bash
npm install
npm run check
```

Tests use Node's built-in test runner. The runtime package has no dependencies.

## Scope

This is an intentionally small demonstration library, not a distributed workflow orchestrator. It does not provide persistence adapters, timers, queues, or cross-process locking.

## License

MIT
