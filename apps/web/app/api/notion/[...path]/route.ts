/**
 * Minimal pass-through to the official Notion API for the in-browser sync
 * dialog (the API does not send CORS headers). Only page and block endpoints
 * are forwarded. Nothing is stored or logged; the caller's token is forwarded
 * in the Authorization header and dropped when the request ends.
 */
const ALLOWED = /^v1\/(pages|blocks)(\/[0-9a-f-]{32,36}(\/children)?)?$/i;

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined)) return Response.json({ object: "error", status: 404, code: "not_proxied", message: "Only page and block endpoints are proxied" }, { status: 404 });
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return Response.json({ object: "error", status: 401, code: "unauthorized", message: "Missing integration secret" }, { status: 401 });
  const url = new URL(req.url);
  const target = `https://api.notion.com/${joined}${url.search}`;
  const res = await fetch(target, {
    method: req.method,
    headers: {
      authorization: auth,
      "notion-version": req.headers.get("notion-version") ?? "2022-06-28",
      "content-type": "application/json",
    },
    body: req.method === "GET" ? undefined : await req.text(),
    cache: "no-store",
  });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const dynamic = "force-dynamic";
