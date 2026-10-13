import { createWorkflow, type WorkflowDefinition } from "../src/index.ts";

type State = "draft" | "in_review" | "approved" | "rejected";
type Context = { title: string; reviewer?: string };
type Event =
  | { type: "SUBMIT" }
  | { type: "APPROVE"; reviewer: string }
  | { type: "REJECT"; reviewer: string };

const definition: WorkflowDefinition<Context, State, Event> = {
  initial: { state: "draft", context: { title: "Architecture note" }, revision: 0 },
  states: ["draft", "in_review", "approved", "rejected"],
  transitions: {
    draft: {
      SUBMIT: { to: "in_review" },
    },
    in_review: {
      APPROVE: {
        to: "approved",
        guard: (_context, event) => event.reviewer.length > 0,
        reduce: (context, event) => ({
          ...context,
          reviewer: event.reviewer,
        }),
      },
      REJECT: { to: "rejected" },
    },
  },
};

const review = createWorkflow(definition);
review.send({ type: "SUBMIT" });
review.send({ type: "APPROVE", reviewer: "Lee" });

console.log(review.snapshot());
