import fs from "node:fs/promises";
import path from "node:path";
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".cache"]);
export const ensureWorkspaceRoot = async (workspaceRoot) => {
    await fs.mkdir(workspaceRoot, { recursive: true });
};
const normalizeRelativePath = (targetPath) => {
    const normalized = targetPath.replace(/\\/g, "/").replace(/^\/+/, "");
    return normalized;
};
export const resolveSafePath = (workspaceRoot, targetPath) => {
    const normalized = normalizeRelativePath(targetPath);
    const absolute = path.resolve(workspaceRoot, normalized);
    const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
    if (absolute !== workspaceRoot && !absolute.startsWith(rootWithSep)) {
        throw new Error("Path is outside workspace root");
    }
    return absolute;
};
export const listFiles = async (workspaceRoot) => {
    const entries = [];
    const walk = async (currentDir, currentRel) => {
        const children = await fs.readdir(currentDir, { withFileTypes: true });
        for (const child of children) {
            if (IGNORED_DIRS.has(child.name)) {
                continue;
            }
            const relPath = currentRel ? `${currentRel}/${child.name}` : child.name;
            const absolutePath = path.join(currentDir, child.name);
            if (child.isDirectory()) {
                entries.push({ path: relPath, type: "directory" });
                await walk(absolutePath, relPath);
            }
            else {
                entries.push({ path: relPath, type: "file" });
            }
        }
    };
    await walk(workspaceRoot, "");
    return entries.sort((a, b) => a.path.localeCompare(b.path));
};
export const readFile = async (workspaceRoot, targetPath) => {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    return fs.readFile(safePath, "utf-8");
};
export const writeFile = async (workspaceRoot, targetPath, content) => {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, "utf-8");
};
export const createDirectory = async (workspaceRoot, targetPath) => {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    await fs.mkdir(safePath, { recursive: true });
};
export const getEntryType = async (workspaceRoot, targetPath) => {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    const stats = await fs.stat(safePath);
    if (stats.isDirectory()) {
        return "directory";
    }
    return "file";
};
export const renameEntry = async (workspaceRoot, oldPath, newPath) => {
    const oldSafePath = resolveSafePath(workspaceRoot, oldPath);
    const newSafePath = resolveSafePath(workspaceRoot, newPath);
    if (oldSafePath === workspaceRoot) {
        throw new Error("Cannot rename workspace root");
    }
    await fs.mkdir(path.dirname(newSafePath), { recursive: true });
    await fs.rename(oldSafePath, newSafePath);
};
export const deleteEntry = async (workspaceRoot, targetPath) => {
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    if (safePath === workspaceRoot) {
        throw new Error("Cannot delete workspace root");
    }
    await fs.rm(safePath, { recursive: true, force: false });
};
