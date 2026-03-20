/**
 * Lightweight in-memory D1Database mock for unit tests.
 *
 * Simulates the D1 API surface used by the repository layer using
 * JavaScript Maps. No native dependencies required.
 */

interface Row {
  [key: string]: unknown;
}

type Table = Map<string, Row>;

export class D1Mock {
  private tables: Map<string, Table> = new Map();

  createTable(name: string): void {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map());
    }
  }

  insert(tableName: string, row: Row): void {
    this.getTable(tableName).set(row['id'] as string, { ...row });
  }

  getById(tableName: string, id: string): Row | null {
    return this.getTable(tableName).get(id) ?? null;
  }

  findBy(tableName: string, field: string, value: unknown): Row | null {
    for (const row of this.getTable(tableName).values()) {
      if (row[field] === value) return { ...row };
    }
    return null;
  }

  asD1(): D1Database {
    const tables = this.tables;

    const getTable = (name: string): Table => {
      const t = tables.get(name);
      if (!t) throw new Error(`Table "${name}" not initialized. Call createTable() first.`);
      return t;
    };

    const prepare = (query: string): ReturnType<D1Database['prepare']> => {
      let boundArgs: unknown[] = [];

      const stmtObj = {
        bind: (...args: unknown[]) => {
          boundArgs = args;
          return stmtObj;
        },

        run: () => {
          // INSERT INTO table (cols) VALUES (?)
          const insert = query.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
          if (insert?.[1] && insert?.[2]) {
            const tableName = insert[1];
            const cols = insert[2].split(',').map((c) => c.trim());
            const row: Row = {};
            cols.forEach((col, i) => {
              row[col] = boundArgs[i];
            });
            getTable(tableName).set(row['id'] as string, row);
            return Promise.resolve({ success: true, results: [] as Row[], meta: { changes: 1 } });
          }

          // UPDATE table SET col = ?, ... WHERE id = ?
          const upd = query.match(/UPDATE\s+(\w+)\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*\?/i);
          if (upd?.[1] && upd?.[2]) {
            const tableName = upd[1];
            const cols = upd[2].split(',').map((s) =>
              s
                .trim()
                .replace(/\s*=\s*\?$/, '')
                .trim(),
            );
            const id = boundArgs[boundArgs.length - 1] as string;
            const row = getTable(tableName).get(id);
            if (row) {
              cols.forEach((col, i) => {
                row[col] = boundArgs[i];
              });
            }
            return Promise.resolve({
              success: true,
              results: [] as Row[],
              meta: { changes: row ? 1 : 0 },
            });
          }

          // DELETE FROM table WHERE id = ?
          const del = query.match(/DELETE FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i);
          if (del?.[1]) {
            const tableName = del[1];
            const id = boundArgs[0] as string;
            const existed = getTable(tableName).has(id);
            getTable(tableName).delete(id);
            return Promise.resolve({
              success: true,
              results: [] as Row[],
              meta: { changes: existed ? 1 : 0 },
            });
          }

          return Promise.resolve({ success: true, results: [] as Row[], meta: {} });
        },

        first: () => {
          // SELECT COUNT(*) as total FROM table [WHERE ...]
          const count = query.match(/SELECT COUNT\(\*\) as total FROM (\w+)/i);
          if (count?.[1]) {
            const tableName = count[1];
            let rows = Array.from(getTable(tableName).values());
            if (boundArgs.length > 0) {
              const like = String(boundArgs[0]).replace(/%/g, '').toLowerCase();
              rows = rows.filter(
                (r) =>
                  ((r['email'] as string | undefined) ?? '').toLowerCase().includes(like) ||
                  ((r['profile_json'] as string | undefined) ?? '').toLowerCase().includes(like),
              );
            }
            return Promise.resolve({ total: rows.length });
          }

          // SELECT * FROM table WHERE field = ? [AND field = value]
          const sel = query.match(/SELECT \* FROM (\w+) WHERE (\w+)\s*=\s*\?/i);
          if (sel?.[1] && sel?.[2]) {
            const tableName = sel[1];
            const field = sel[2];
            const value = boundArgs[0];

            const andMatch = query.match(/AND (\w+)\s*=\s*(\d+)/i);
            let row: Row | null = null;

            for (const r of getTable(tableName).values()) {
              if (r[field] === value) {
                row = { ...r };
                break;
              }
            }

            if (row && andMatch?.[1] && andMatch?.[2]) {
              if (row[andMatch[1]] !== Number(andMatch[2])) row = null;
            }

            return Promise.resolve(row ?? null);
          }
          return Promise.resolve(null);
        },

        all: () => {
          // SELECT * FROM table [WHERE (col LIKE ? OR col LIKE ?)] ORDER BY ... LIMIT ? OFFSET ?
          const sel = query.match(/SELECT \* FROM (\w+)/i);
          if (sel?.[1]) {
            const tableName = sel[1];
            let rows = Array.from(getTable(tableName).values()).map((r) => ({ ...r }));

            // Apply LIKE filter when present (both LIKE args carry the same search term)
            if (/LIKE/i.test(query) && boundArgs.length >= 2) {
              const like = String(boundArgs[0]).replace(/%/g, '').toLowerCase();
              rows = rows.filter(
                (r) =>
                  ((r['email'] as string | undefined) ?? '').toLowerCase().includes(like) ||
                  ((r['profile_json'] as string | undefined) ?? '').toLowerCase().includes(like),
              );
            }

            // Sort by created_at DESC
            rows.sort(
              (a, b) => ((b['created_at'] as number) ?? 0) - ((a['created_at'] as number) ?? 0),
            );

            // LIMIT and OFFSET are always the last two bound args
            if (boundArgs.length >= 2) {
              const limit = Number(boundArgs[boundArgs.length - 2]);
              const offset = Number(boundArgs[boundArgs.length - 1]);
              rows = rows.slice(offset, offset + limit);
            }

            return Promise.resolve({ results: rows, success: true, meta: {} });
          }
          return Promise.resolve({ results: [] as Row[], success: true, meta: {} });
        },
      };

      return stmtObj as unknown as ReturnType<D1Database['prepare']>;
    };

    return { prepare } as unknown as D1Database;
  }

  private getTable(name: string): Table {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Table "${name}" not initialized.`);
    return t;
  }
}
