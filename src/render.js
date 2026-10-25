import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

/** Replaces {{name}} placeholders. GitHub's ${{ expr }} (with spaces) is left alone. */
export function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? String(vars[key] ?? '') : m));
}
