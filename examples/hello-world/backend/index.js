export function fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/hello") {
    return Response.json({
      ok: true,
      message: "Hello from the W7S Docker backend",
      repository: env.W7S_REPOSITORY,
      commitHash: env.W7S_COMMIT_HASH,
      deployedAt: env.W7S_DEPLOYED_AT
    });
  }

  return new Response("Not found\n", { status: 404 });
}
