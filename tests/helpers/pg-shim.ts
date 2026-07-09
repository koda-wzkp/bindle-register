/**
 * Minimal Supabase-client lookalike backed directly by Postgres via `pg`.
 *
 * Route handlers exercise exactly the query-builder surface implemented
 * here (select/insert/update/delete + eq/in/order + single/maybeSingle, and
 * rpc). Queries run as the connection's superuser — the same trust level as
 * the production service role: RLS is bypassed, but the migration's guard
 * triggers and SQL functions apply in full, which is precisely what these
 * tests are about.
 */
import { Pool } from 'pg';

interface Result<T = unknown> {
  data: T;
  error: { message: string; code?: string; details?: string } | null;
}

type Row = Record<string, unknown>;

function toError(e: unknown): { message: string; code?: string; details?: string } {
  const err = e as { message?: string; code?: string; detail?: string };
  return { message: err.message ?? String(e), code: err.code, details: err.detail };
}

class QueryBuilder implements PromiseLike<Result> {
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private wheres: string[] = [];
  private params: unknown[] = [];
  private payload: Row | Row[] | null = null;
  private wantRows = true;
  private takeSingle: 'no' | 'strict' | 'maybe' = 'no';
  private orderClause = '';

  constructor(
    private pool: Pool,
    private table: string,
  ) {}

  select(_cols?: string): this {
    // For insert/update chains this requests RETURNING; standalone it is the
    // read mode. Column projection is intentionally ignored — handlers only
    // ever read columns that exist.
    this.wantRows = true;
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.mode = 'insert';
    this.payload = payload;
    this.wantRows = false;
    return this;
  }

  update(payload: Row): this {
    this.mode = 'update';
    this.payload = payload;
    this.wantRows = false;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    this.wantRows = false;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.params.push(value);
    this.wheres.push(`${quoteIdent(column)} = $${this.params.length}`);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.params.push(values);
    this.wheres.push(`${quoteIdent(column)} = any($${this.params.length})`);
    return this;
  }

  not(column: string, op: string, value: string): this {
    if (op !== 'in') throw new Error(`pg-shim: unsupported not() operator ${op}`);
    const list = value.replace(/^\(|\)$/g, '').split(',');
    this.params.push(list);
    this.wheres.push(`not (${quoteIdent(column)}::text = any($${this.params.length}))`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderClause = ` order by ${quoteIdent(column)} ${opts?.ascending === false ? 'desc' : 'asc'}`;
    return this;
  }

  single(): this {
    this.takeSingle = 'strict';
    this.wantRows = true;
    return this;
  }

  maybeSingle(): this {
    this.takeSingle = 'maybe';
    this.wantRows = true;
    return this;
  }

  private sql(): string {
    const where = this.wheres.length ? ` where ${this.wheres.join(' and ')}` : '';
    const returning = this.wantRows ? ' returning *' : '';
    switch (this.mode) {
      case 'select':
        return `select * from ${quoteIdent(this.table)}${where}${this.orderClause}`;
      case 'insert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const cols = Object.keys(rows[0]);
        const tuples = rows
          .map(
            (row) =>
              `(${cols
                .map((c) => {
                  this.params.push(toParam(row[c]));
                  return `$${this.params.length}`;
                })
                .join(', ')})`,
          )
          .join(', ');
        return `insert into ${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) values ${tuples}${returning}`;
      }
      case 'update': {
        const sets = Object.entries(this.payload as Row).map(([c, v]) => {
          this.params.push(toParam(v));
          return `${quoteIdent(c)} = $${this.params.length}`;
        });
        return `update ${quoteIdent(this.table)} set ${sets.join(', ')}${where}${returning}`;
      }
      case 'delete':
        return `delete from ${quoteIdent(this.table)}${where}${returning}`;
    }
  }

  async then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    let result: Result;
    try {
      // Build SQL after all chained filters have accumulated. Insert/update
      // param placeholders are appended after the where params, so compute
      // wheres first by building the where-referencing modes lazily here.
      const { rows } = await this.pool.query(this.sql(), this.params);
      if (this.takeSingle === 'strict') {
        result =
          rows.length === 1
            ? { data: rows[0], error: null }
            : { data: null, error: { message: `expected exactly one row, got ${rows.length}` } };
      } else if (this.takeSingle === 'maybe') {
        result =
          rows.length <= 1
            ? { data: rows[0] ?? null, error: null }
            : { data: null, error: { message: `expected at most one row, got ${rows.length}` } };
      } else {
        result = { data: this.wantRows ? rows : null, error: null };
      }
    } catch (e) {
      result = { data: null, error: toError(e) };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`pg-shim: suspicious identifier ${name}`);
  return `"${name}"`;
}

/** jsonb params must be serialized; pg would otherwise send arrays/objects as Postgres arrays. */
function toParam(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return value;
}

export interface ShimClient {
  from(table: string): QueryBuilder;
  rpc(fn: string, args: Record<string, unknown>): Promise<Result>;
}

export function createShimClient(pool: Pool): ShimClient {
  return {
    from(table: string) {
      return new QueryBuilder(pool, table);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      const keys = Object.keys(args);
      const call = keys.map((k, i) => `${quoteIdent(k)} := $${i + 1}`).join(', ');
      try {
        const { rows } = await pool.query(
          `select ${quoteIdent(fn)}(${call}) as result`,
          keys.map((k) => toParam(args[k])),
        );
        return { data: rows[0]?.result ?? null, error: null };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    },
  };
}
