import pkg from "../../../../package.json";

/**
 * DEV-GUIDELINES "Health check": every deployed app answers GET /api/health.
 * This app reads no environment variables and has no database, so the check
 * is the version.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { ok: true, version: pkg.version, missingEnv: [], database: "none" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
