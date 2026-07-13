export const slug = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

export const splitRepository = (repository: string | undefined): { owner: string; repo: string } => {
  const [owner = "local", repo = "app"] = (repository || "local/app").split("/");
  return {
    owner: slug(owner, "local"),
    repo: slug(repo, "app")
  };
};

export const environmentFromBranch = (branch: string, override?: string | null): string => {
  if (override?.trim()) return slug(override, "production");
  return branch === "main" || branch === "master" ? "production" : slug(branch, "branch");
};

export const hostWithoutPort = (host: string | undefined): string => (host || "").split(":")[0].toLowerCase();
