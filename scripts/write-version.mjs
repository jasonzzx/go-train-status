import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

let sha = 'dev';
try {
  sha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // no git available at build time, fall back to timestamp only
}

const version = `${Date.now()}-${sha}`;
writeFileSync('public/version.json', JSON.stringify({ version }));
console.log(`[write-version] ${version}`);
