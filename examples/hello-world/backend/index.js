export async function fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/hello") {
    const count = Number((await env.CACHE.get("hello-count")) || "0") + 1;
    await env.CACHE.put("hello-count", String(count), { metadata: { route: url.pathname } });
    await env.DB.prepare("INSERT INTO visits (path) VALUES (?)").bind(url.pathname).run();
    const dbCount = await env.DB.prepare("SELECT COUNT(*) as total FROM visits").first("total");

    return Response.json({
      ok: true,
      message: "Hello from the W7S Docker backend",
      repository: env.W7S_REPOSITORY,
      commitHash: env.W7S_COMMIT_HASH,
      deployedAt: env.W7S_DEPLOYED_AT,
      publicMessage: env.PUBLIC_MESSAGE || null,
      privateConfigured: Boolean(env.PRIVATE_MESSAGE),
      kvCount: count,
      dbCount
    });
  }

  return new Response("Not found\n", { status: 404 });
}
