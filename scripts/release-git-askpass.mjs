#!/usr/bin/env node
// Reads the release-only Git credential supplied to the transient systemd unit.
import fs from "node:fs";
import path from "node:path";

const prompt = process.argv[2] ?? "";
if (/username/i.test(prompt)) {
  process.stdout.write("x-access-token\n");
  process.exit(0);
}
const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
if (!credentialDirectory) {
  process.exit(1);
}
const token = fs.readFileSync(path.join(credentialDirectory, "release-git-token"), "utf8").trim();
if (!token) {
  process.exit(1);
}
process.stdout.write(`${token}\n`);
