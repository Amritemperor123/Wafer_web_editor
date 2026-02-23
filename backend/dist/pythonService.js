import { spawn } from "node:child_process";
export const runPython = async (pythonBin, code, timeoutMs = 7000) => {
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
