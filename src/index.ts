export type EventObject<E extends string = string> = Readonly<{ type: E }>;

export type Snapshot<C, S extends string> = Readonly<{
  state: S;
  context: Readonly<C>;
  revision: number;
}>;

export type HistoryEntry<C, S extends string, E extends { readonly type: string }> = Readonly<{
  from: S;
  to: S;
  event: E;
  context: Readonly<C>;
  revision: number;
  occurredAt: string;
}>;

export type Transition<C, S extends string, E extends { readonly type: string }> = Readonly<{
  to: S | ((context: Readonly<C>, event: E) => S);
  guard?: (context: Readonly<C>, event: E) => boolean;
  reduce?: (context: Readonly<C>, event: E) => C;
}>;

type TransitionMap<C, S extends string, E extends { readonly type: string }> = {
  readonly [K in E["type"]]?: Transition<C, S, Extract<E, { readonly type: K }>>;
};

export type WorkflowDefinition<C, S extends string, E extends { readonly type: string }> = Readonly<{
  initial: Snapshot<C, S>;
  states: readonly S[];
  transitions: Readonly<
    Partial<Record<S, Readonly<TransitionMap<C, S, E>>>>
  >;
}>;

export type TransitionSuccess<C, S extends string, E extends { readonly type: string }> = Readonly<{
  ok: true;
  snapshot: Snapshot<C, S>;
  entry: HistoryEntry<C, S, E>;
}>;

export type TransitionFailure<S extends string> = Readonly<{
  ok: false;
  code: "UNKNOWN_EVENT" | "GUARD_REJECTED";
  state: S;
  message: string;
}>;

export type TransitionResult<C, S extends string, E extends { readonly type: string }> =
  | TransitionSuccess<C, S, E>
  | TransitionFailure<S>;

export type SerializedWorkflow<C, S extends string, E extends { readonly type: string }> = Readonly<{
  snapshot: Snapshot<C, S>;
  history: readonly HistoryEntry<C, S, E>[];
}>;

export interface Workflow<C, S extends string, E extends { readonly type: string }> {
  snapshot(): Snapshot<C, S>;
  history(): readonly HistoryEntry<C, S, E>[];
  can(event: E): boolean;
  send(event: E): TransitionResult<C, S, E>;
  serialize(): SerializedWorkflow<C, S, E>;
}

type Clock = () => string;

const clone = <T>(value: T): T => structuredClone(value);

function freezeSnapshot<C, S extends string>(snapshot: Snapshot<C, S>): Snapshot<C, S> {
  return Object.freeze({
    state: snapshot.state,
    context: Object.freeze(clone(snapshot.context)),
    revision: snapshot.revision,
  });
}

export function createWorkflow<C, S extends string, E extends { readonly type: string }>(
  definition: WorkflowDefinition<C, S, E>,
  options: Readonly<{
    restored?: SerializedWorkflow<C, S, E>;
    clock?: Clock;
  }> = {},
): Workflow<C, S, E> {
  const knownStates = new Set<string>(definition.states);
  const restored = options.restored;
  const clock = options.clock ?? (() => new Date().toISOString());

  if (restored && !knownStates.has(restored.snapshot.state)) {
    throw new Error(`Cannot restore unknown state: ${restored.snapshot.state}`);
  }

  let current = freezeSnapshot(restored?.snapshot ?? definition.initial);
  const entries: HistoryEntry<C, S, E>[] = restored
    ? restored.history.map((entry) => Object.freeze(clone(entry)))
    : [];

  const findTransition = (event: E): Transition<C, S, E> | undefined =>
    definition.transitions[current.state]?.[event.type as E["type"]] as
      | Transition<C, S, E>
      | undefined;

  return Object.freeze({
    snapshot: () => freezeSnapshot(current),

    history: () => Object.freeze(entries.map((entry) => Object.freeze(clone(entry)))),

    can: (event: E) => {
      const transition = findTransition(event);
      return Boolean(transition && (!transition.guard || transition.guard(current.context, event)));
    },

    send: (event: E) => {
      const transition = findTransition(event);

      if (!transition) {
        return Object.freeze({
          ok: false as const,
          code: "UNKNOWN_EVENT" as const,
          state: current.state,
          message: `Event ${event.type} is not allowed from ${current.state}`,
        });
      }

      if (transition.guard && !transition.guard(current.context, event)) {
        return Object.freeze({
          ok: false as const,
          code: "GUARD_REJECTED" as const,
          state: current.state,
          message: `Guard rejected ${event.type} from ${current.state}`,
        });
      }

      const from = current.state;
      const nextContext = transition.reduce
        ? transition.reduce(current.context, event)
        : clone(current.context);
      const to = typeof transition.to === "function"
        ? transition.to(current.context, event)
        : transition.to;

      if (!knownStates.has(to)) {
        throw new Error(`Transition resolved to unknown state: ${to}`);
      }

      current = freezeSnapshot({
        state: to,
        context: nextContext,
        revision: current.revision + 1,
      });

      const entry = Object.freeze({
        from,
        to,
        event: Object.freeze(clone(event)),
        context: current.context,
        revision: current.revision,
        occurredAt: clock(),
      });
      entries.push(entry);

      return Object.freeze({ ok: true as const, snapshot: current, entry });
    },

    serialize: () => Object.freeze({
      snapshot: freezeSnapshot(current),
      history: Object.freeze(entries.map((entry) => Object.freeze(clone(entry)))),
    }),
  });
}
