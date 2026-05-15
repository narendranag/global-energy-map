import * as duckdb from "@duckdb/duckdb-wasm";

let _db: duckdb.AsyncDuckDB | undefined;

export async function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(
    new Blob(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      [`importScripts("${bundle.mainWorker!}");`],
      { type: "text/javascript" },
    ),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  _db = db;
  return db;
}
