import { spawn } from "node:child_process";

export type PythonRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

export const runPython = async (
  pythonBin: string,
  code: string,
  timeoutMs = 7000,
): Promise<PythonRunResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ["-c", code], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    });
  });
};
