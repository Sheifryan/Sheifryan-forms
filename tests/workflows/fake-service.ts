// A tiny in-memory stand-in for the Supabase service client, so the workflow
// runner can be exercised with no database.
//
// It implements only the query shape lib/workflows.ts actually uses:
// select → eq/is/or → order/limit → maybeSingle/single, plus insert and update
// (and being awaited directly). It also enforces the one constraint the runner's
// idempotency depends on: workflow_runs (workflow_id, response_id) is unique.

export type Row = Record<string, any>;

export interface FakeDb {
  workflows: Row[];
  responses: Row[];
  workflow_runs: Row[];
  notifications: Row[];
  activity_logs: Row[];
  credit_transactions: Row[];
  workspace_members: Row[];
  workspaces: Row[];
}

export function makeDb(seed: Partial<FakeDb> = {}): FakeDb {
  return {
    workflows: [],
    responses: [],
    workflow_runs: [],
    notifications: [],
    activity_logs: [],
    credit_transactions: [],
    workspace_members: [],
    workspaces: [],
    ...seed,
  };
}

interface Filter {
  col: string;
  op: "eq" | "is";
  value: unknown;
}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.op === "is") {
      return f.value === null ? row[f.col] === null || row[f.col] === undefined : row[f.col] === f.value;
    }
    return row[f.col] === f.value;
  });
}

/** Only handles the expression the runner builds: "col.eq.<v>,col.is.null". */
function matchesOr(row: Row, expression: string | null): boolean {
  if (!expression) return true;
  return expression.split(",").some((clause) => {
    const [col, op, ...rest] = clause.trim().split(".");
    const value = rest.join(".");
    if (op === "eq") return String(row[col]) === value;
    if (op === "is") return value === "null" ? row[col] === null || row[col] === undefined : String(row[col]) === value;
    return false;
  });
}

export interface FakeService {
  from: (table: keyof FakeDb) => any;
}

export function fakeService(db: FakeDb): FakeService {
  return {
    from(table: keyof FakeDb) {
      const filters: Filter[] = [];
      let orExpression: string | null = null;
      const rows = (): Row[] => (db[table] ??= []) as Row[];
      const current = (): Row[] =>
        rows().filter((row) => matchesFilters(row, filters) && matchesOr(row, orExpression));

      // supabase-js returns a *builder* from insert/update too, so `.eq()` can
      // follow them and the result is awaited. Mirror that: filters chained after
      // the mutation are applied when it finally runs.
      const mutation = (apply: () => { data: unknown; error: unknown }): any => {
        const node: any = {
          eq: (col: string, value: unknown) => {
            filters.push({ col, op: "eq", value });
            return node;
          },
          is: (col: string, value: unknown) => {
            filters.push({ col, op: "is", value });
            return node;
          },
          or: (expression: string) => {
            orExpression = expression;
            return node;
          },
          select: () => node,
          single: () => apply(),
          maybeSingle: () => apply(),
          then: (resolve: (value: unknown) => unknown) => resolve(apply()),
        };
        return node;
      };

      const doInsert = (payload: Row | Row[]): { data: unknown; error: unknown } => {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) {
          if (table === "workflow_runs") {
            const clash = rows().some(
              (row) => row.workflow_id === item.workflow_id && row.response_id === item.response_id
            );
            if (clash) {
              return {
                data: null,
                error: {
                  message:
                    'duplicate key value violates unique constraint "workflow_runs_workflow_id_response_id_key"',
                },
              };
            }
          }
          rows().push({ id: `${String(table)}-${rows().length + 1}`, ...item });
        }
        return { data: list, error: null };
      };

      const doUpdate = (patch: Row): { data: unknown; error: unknown } => {
        for (const row of current()) Object.assign(row, patch);
        return { data: null, error: null };
      };

      const builder: any = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          filters.push({ col, op: "eq", value });
          return builder;
        },
        is: (col: string, value: unknown) => {
          filters.push({ col, op: "is", value });
          return builder;
        },
        or: (expression: string) => {
          orExpression = expression;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => ({ data: current()[0] ?? null, error: null }),
        single: () => {
          const row = current()[0];
          return row ? { data: row, error: null } : { data: null, error: { message: "no rows returned" } };
        },
        insert: (payload: Row | Row[]) => mutation(() => doInsert(payload)),
        update: (patch: Row) => mutation(() => doUpdate(patch)),
        // Query builders are thenable in supabase-js, so `await` works on them.
        then: (resolve: (value: unknown) => unknown) => resolve({ data: current(), error: null }),
      };

      return builder;
    },
  } as FakeService;
}

