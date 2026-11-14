import { spawn } from "node:child_process";

const SECRET = /ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/g;

export function redact(text: string): string {
  return text.replace(SECRET, "ed25519:[REDACTED]");
}

export function runNear(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("near", ["--quiet", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        const safe = redact(stdout).trim();
        if (safe) console.log(safe);
        resolve();
        return;
      }
      reject(new Error(redact(`near ${args[0] ?? ""} ${args[1] ?? ""} failed\n${stderr}\n${stdout}`).slice(0, 2000)));
    });
  });
}
