export function ok(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function fail(error: unknown, status = 500) {
  return Response.json(
    { error: error instanceof Error ? error.message : String(error || "Request failed") },
    { status }
  );
}

export function notImplemented(name: string) {
  return ok({
    route: name,
    status: "available-in-current-node-server",
    note: "This project currently runs through server.js, not a Next.js runtime. The route is scaffolded for App Router migration."
  });
}
