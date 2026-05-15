import fs from "node:fs/promises";
import path from "node:path";
import type { Catalog } from "@/lib/data-catalog/types";
import { parseCatalog } from "@/lib/data-catalog";

async function readCatalog(): Promise<Catalog> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "public", "data", "catalog.json"),
    "utf8",
  );
  return parseCatalog(JSON.parse(raw) as unknown);
}

async function readMethodology(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
}

export default async function AboutPage() {
  const [catalog, methodology] = await Promise.all([readCatalog(), readMethodology()]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Methodology</h1>
      <pre className="mt-4 whitespace-pre-wrap text-sm font-sans leading-relaxed text-slate-700">
        {methodology}
      </pre>
      <h2 className="mt-10 text-2xl font-semibold">Data sources</h2>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">Label</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">License</th>
            <th className="py-2 pr-4">As of</th>
          </tr>
        </thead>
        <tbody>
          {catalog.entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-200">
              <td className="py-2 pr-4">{e.label}</td>
              <td className="py-2 pr-4">
                <a className="text-blue-600 underline hover:text-blue-800" href={e.source_url}>
                  {e.source_name}
                </a>
              </td>
              <td className="py-2 pr-4">{e.license}</td>
              <td className="py-2 pr-4 font-mono">{e.as_of}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
