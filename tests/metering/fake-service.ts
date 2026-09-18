// A tiny in-memory stand-in for a Supabase client, so the shared usage meter
// (lib/usage.ts) and the AI quota writer (lib/ai/quota.ts) can be exercised
// with no database.
//
// It implements the query shape those two modules actually use:
//   select(cols, { count, head }) → eq/gte/in → awaited
//   insert(payload) → awaited
// including the `count` value that `{ count: "exact", head: true }` returns.

export type Row = Record<string, any>;

export interface FakeDb {
  forms: Row[];
  responses: Row[];
  form_files: Row[];
  workflows: Row[];
  workspace_members: Row[];
  ai_usage: Row[];
}

export function makeDb(seed: Partial<FakeDb> = {}): FakeDbWithFailure {
  return {
    forms: [],
    responses: [],
    form_files: [],
    workflows: [],
    workspace_members: [],
    ai_usage: [],
    ...seed,
  };
}

interface Filter {
  col: string;
  op: "eq" | "gte" | "in";
  value: unknown;
}

export interface FakeService {
  from: (table: keyof FakeDb) => any;
}

/** Set `db.failOn` to a table name to make its insert return an error. */
export interface FakeDbWithFailure extends FakeDb {
  failOn?: keyof FakeDb;
}

export function fakeService(db: FakeDbWithFailure): FakeService {
  return {
    from(table: keyof FakeDb) {
      const filters: Filter[] = [];
      let counting = false;
      const rows = (): Row[] => (db[table] ??= []) as Row[];

      const matches = (row: Row): boolean =>
        filters.every((f) => {
          if (f.op === "eq") return row[f.col] === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(row[f.col]);
          if (f.op === "gte") return new Date(row[f.col] as string) >= new Date(f.value as string);
          return true;
        });
      const current = (): Row[] => rows().filter(matches);
      const result = () => ({ data: counting ? null : current(), count: current().length, error: null });

      const builder: any = {
        select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) counting = true;
          return builder;
        },
        eq: (col: string, value: unknown) => {
          filters.push({ col, op: "eq", value });
          return builder;
        },
        gte: (col: string, value: unknown) => {
          filters.push({ col, op: "gte", value });
          return builder;
        },
        in: (col: string, value: unknown[]) => {
          filters.push({ col, op: "in", value });
          return builder;
        },
        insert: (payload: Row | Row[]) => {
          if (db.failOn === table) {
            return { data: null, error: { message: `insert into ${String(table)} failed` } };
          }
          const list = Array.isArray(payload) ? payload : [payload];
          for (const item of list) rows().push({ id: `${String(table)}-${rows().length + 1}`, ...item });
          return { data: list, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };

      return builder;
    },
  } as FakeService;
}
