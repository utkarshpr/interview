import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let sqlPromise;
self.onmessage = async ({ data }) => {
  try {
    sqlPromise ||= initSqlJs({ locateFile: () => wasmUrl });
    const SQL = await sqlPromise;
    const db = new SQL.Database();
    try {
      db.run(data.setup || '');
      const result = db.exec(data.query || '');
      const rows = result.flatMap(({ columns, values }) => values.map((valuesRow) => Object.fromEntries(columns.map((column, index) => [column, valuesRow[index]]))));
      const output = JSON.stringify(rows.slice(0, 500));
      self.postMessage({ output, truncated:rows.length > 500 });
    } finally { db.close(); }
  } catch (error) { self.postMessage({ error:error.message || 'SQL execution failed.' }); }
};
