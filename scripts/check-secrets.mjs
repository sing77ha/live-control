// Fails if Git tracks anything that looks like a credential. Requires a Git repository.
//   pnpm check:secrets
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const forbiddenPath =
  /(^|\/)\.env($|\.)|\.(pem|key|p12|pfx|der|jks|keystore|tfstate)$|(^|\/)id_(rsa|ed25519|ecdsa)|credential|service-account|(^|\/)secrets?\//i;
const allowedPath = /\.env\.example$/;
const contentPatterns = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/sk_live_[A-Za-z0-9]{10,}/, 'Stripe live key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/"private_key"\s*:/, 'service-account JSON'],
];

const problems = [];
for (const file of files) {
  if (forbiddenPath.test(file) && !allowedPath.test(file)) problems.push(`${file}: sensitive file name`);
  let text;
  try {
    text = readFileSync(`${root}${file}`, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  for (const [pattern, label] of contentPatterns) {
    if (pattern.test(text)) problems.push(`${file}: contains ${label}`);
  }
  if (allowedPath.test(file)) {
    for (const line of text.split('\n')) {
      const match = /^([A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY))=(.+)$/.exec(line);
      if (match && !match[3].includes('CHANGE_ME')) problems.push(`${file}: ${match[1]} is not a CHANGE_ME placeholder`);
    }
  }
}

if (problems.length > 0) {
  console.error('Secret check FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Secret check OK: ${files.length} tracked files, no credentials found.`);
