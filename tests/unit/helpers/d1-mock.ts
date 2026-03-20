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
          const insert = query.match(
            /INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
          );
          if (insert?.[1] && insert?.[2]) {
            const tableName = insert[1];
            const cols = insert[2].split(',').map((c) => c.trim());
            const row: Row = {};
            cols.forEach((col, i) => {
              row[col] = boundArgs[i];
            });
            getTable(tableName).set(row['id'] as string, row);
          }
          return Promise.resolve({ success: true, results: [] as Row[], meta: {} });
        },

        first: () => {
          const sel = query.match(/SELECT \* FROM (\w+) WHERE (\w+)\s*=\s*\?/i);
          if (sel?.[1] && sel?.[2]) {
            const tableName = sel[1];
            const field = sel[2];
            const value = boundArgs[0];

            const andMatch = query.match(/AND (\w+)\s*=\s*(\d+)/i);
            let row: Row | null = null;

            for (const r of getTable(tableName).values()) {
              if (r[field] === value) { row = { ...r }; break; }
            }

            if (row && andMatch?.[1] && andMatch?.[2]) {
              if (row[andMatch[1]] !== Number(andMatch[2])) row = null;
            }

            return Promise.resolve(row ?? null);
          }
          return Promise.resolve(null);
        },

        all: () => Promise.resolve({ results: [] as Row[], success: true, meta: {} }),
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
