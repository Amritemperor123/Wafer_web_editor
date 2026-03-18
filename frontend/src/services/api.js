const API_ENDPOINTS = {
  files: "/api/files",
  fileContent: "/api/files/content",
  folderCreate: "/api/files/folder",
  runPython: "/api/python/run",
  pythonIntel: "/api/python/intel",
  rename: "/api/files/rename",
  remove: "/api/files",
  download: "/api/files/download",
  health: "/api/health",
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const requestJson = async (url, init, fallbackMessage) => {
  const response = await fetch(url, init);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(body.error ?? fallbackMessage);
  }

  return body;
};

export const fetchFiles = async () => {
  const body = await requestJson(API_ENDPOINTS.files, undefined, "Failed to load files");
  return body.files ?? [];
};

export const fetchWorkspaceMeta = async () => {
  const response = await fetch(API_ENDPOINTS.health);
  const body = await readJson(response);
  return response.ok ? body : null;
};

export const fetchFileContent = async (path) => {
  const body = await requestJson(
    `${API_ENDPOINTS.fileContent}?path=${encodeURIComponent(path)}`,
    undefined,
    "Failed to read file",
  );

  return body.content ?? "";
};

export const saveFileContent = async (path, content) =>
  requestJson(
    API_ENDPOINTS.fileContent,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    },
    "Save failed",
  );

export const createFolderEntry = async (path) =>
  requestJson(
    API_ENDPOINTS.folderCreate,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    },
    "Failed to create folder",
  );

export const renameFileSystemEntry = async (oldPath, newPath) =>
  requestJson(
    API_ENDPOINTS.rename,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath, newPath }),
    },
    "Rename failed",
  );

export const deleteFileSystemEntry = async (path) =>
  requestJson(
    `${API_ENDPOINTS.remove}?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
    "Delete failed",
  );

export const requestPythonIntel = async (payload) =>
  requestJson(
    API_ENDPOINTS.pythonIntel,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Python intelligence request failed",
  );

export const runPythonCode = async (code) =>
  requestJson(
    API_ENDPOINTS.runPython,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
    "Failed to execute code",
  );

export const downloadFileSystemEntry = async (path) => {
  const response = await fetch(`${API_ENDPOINTS.download}?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(body.error ?? "Download failed");
  }

  return response;
};
