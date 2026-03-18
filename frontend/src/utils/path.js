export const remapPath = (path, fromPath, toPath) => {
  if (path === fromPath) {
    return toPath;
  }

  if (path.startsWith(`${fromPath}/`)) {
    return `${toPath}${path.slice(fromPath.length)}`;
  }

  return path;
};

export const isWithinPath = (candidate, root) =>
  candidate === root || candidate.startsWith(`${root}/`);

export const fileNameFromPath = (entryPath) => entryPath.split("/").at(-1) ?? entryPath;

export const toAbsolutePath = (workspaceRoot, relativePath) => {
  if (!workspaceRoot) {
    return relativePath;
  }

  const trailingSlashTrimmed = workspaceRoot.replace(/[\\/]+$/, "");
  const separator = trailingSlashTrimmed.includes("\\") ? "\\" : "/";
  const normalizedRelativePath = relativePath.replace(/\//g, separator);
  return `${trailingSlashTrimmed}${separator}${normalizedRelativePath}`;
};
