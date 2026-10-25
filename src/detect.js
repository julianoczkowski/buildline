// Inspects a project directory and reports what is there: language, framework,
// package manager, and the commands the factory should use as quality gates.
// Everything is best-effort and read-only; unknown values stay null.
import fs from 'node:fs';
import path from 'node:path';

const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.factory', '.claude', '.idea', '.vscode']);

export function isEmptyProject(dir) {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir).filter((e) => !IGNORED.has(e));
  const meaningful = entries.filter((e) => !/^(readme|license|\.gitignore|\.env)/i.test(e));
  return meaningful.length === 0;
}

function detectNode(dir, stack) {
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg) return;
  stack.languages.push(exists(dir, 'tsconfig.json') ? 'TypeScript' : 'JavaScript');

  stack.packageManager = exists(dir, 'pnpm-lock.yaml')
    ? 'pnpm'
    : exists(dir, 'yarn.lock')
      ? 'yarn'
      : exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')
        ? 'bun'
        : 'npm';
  const run = stack.packageManager === 'npm' ? 'npm run' : stack.packageManager;

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks = [
    ['next', 'Next.js'],
    ['nuxt', 'Nuxt'],
    ['@remix-run/react', 'Remix'],
    ['@sveltejs/kit', 'SvelteKit'],
    ['astro', 'Astro'],
    ['@angular/core', 'Angular'],
    ['vue', 'Vue'],
    ['svelte', 'Svelte'],
    ['solid-js', 'Solid'],
    ['react-native', 'React Native'],
    ['expo', 'Expo'],
    ['electron', 'Electron'],
    ['react', 'React'],
    ['@nestjs/core', 'NestJS'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['hono', 'Hono'],
  ];
  for (const [dep, name] of frameworks) if (deps[dep]) stack.frameworks.push(name);
  // "React" is implied by Next/Remix/React Native; keep the list readable.
  if (stack.frameworks.some((f) => ['Next.js', 'Remix', 'React Native', 'Expo'].includes(f))) {
    stack.frameworks = stack.frameworks.filter((f) => f !== 'React');
  }

  const ui = [
    ['tailwindcss', 'Tailwind CSS'],
    ['@mui/material', 'MUI'],
    ['@chakra-ui/react', 'Chakra UI'],
    ['@radix-ui/react-slot', 'Radix / shadcn'],
    ['styled-components', 'styled-components'],
  ];
  for (const [dep, name] of ui) if (deps[dep]) stack.ui.push(name);
  if (exists(dir, 'components.json')) stack.ui.push('shadcn/ui');
  stack.ui = [...new Set(stack.ui)];

  const s = pkg.scripts || {};
  if (s.test && !/no test specified/.test(s.test)) stack.commands.test = `${run} test`;
  if (s.lint) stack.commands.lint = `${run} lint`;
  if (s.typecheck) stack.commands.typecheck = `${run} typecheck`;
  else if (s['type-check']) stack.commands.typecheck = `${run} type-check`;
  else if (exists(dir, 'tsconfig.json')) stack.commands.typecheck = 'npx tsc --noEmit';
  if (s.build) stack.commands.build = `${run} build`;
  if (s.dev) stack.commands.dev = `${run} dev`;
  else if (s.start) stack.commands.dev = `${run} start`;

  if (deps.vitest) stack.testing.push('Vitest');
  if (deps.jest) stack.testing.push('Jest');
  if (deps['@playwright/test']) stack.testing.push('Playwright');
  if (deps.cypress) stack.testing.push('Cypress');
  if (deps['@storybook/react'] || deps.storybook) stack.testing.push('Storybook');

  if (pkg.workspaces || exists(dir, 'pnpm-workspace.yaml') || exists(dir, 'turbo.json') || exists(dir, 'nx.json')) {
    stack.monorepo = true;
  }
}

function detectPython(dir, stack) {
  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  const reqs = readText(path.join(dir, 'requirements.txt'));
  if (!pyproject && !reqs && !exists(dir, 'setup.py')) return;
  stack.languages.push('Python');
  const all = (pyproject + '\n' + reqs).toLowerCase();
  stack.packageManager ??= exists(dir, 'uv.lock') ? 'uv' : exists(dir, 'poetry.lock') ? 'poetry' : 'pip';
  for (const [dep, name] of [
    ['django', 'Django'],
    ['fastapi', 'FastAPI'],
    ['flask', 'Flask'],
    ['streamlit', 'Streamlit'],
  ]) {
    if (all.includes(dep)) stack.frameworks.push(name);
  }
  const prefix = stack.packageManager === 'uv' ? 'uv run ' : stack.packageManager === 'poetry' ? 'poetry run ' : '';
  if (all.includes('pytest') || exists(dir, 'tests')) stack.commands.test ??= `${prefix}pytest`;
  if (all.includes('ruff')) stack.commands.lint ??= `${prefix}ruff check .`;
  if (all.includes('mypy')) stack.commands.typecheck ??= `${prefix}mypy .`;
}

function detectOthers(dir, stack) {
  if (exists(dir, 'go.mod')) {
    stack.languages.push('Go');
    stack.commands.test ??= 'go test ./...';
    stack.commands.lint ??= 'go vet ./...';
    stack.commands.build ??= 'go build ./...';
  }
  if (exists(dir, 'Cargo.toml')) {
    stack.languages.push('Rust');
    stack.commands.test ??= 'cargo test';
    stack.commands.lint ??= 'cargo clippy -- -D warnings';
    stack.commands.build ??= 'cargo build';
  }
  if (exists(dir, 'Gemfile')) {
    stack.languages.push('Ruby');
    if (readText(path.join(dir, 'Gemfile')).includes('rails')) stack.frameworks.push('Rails');
    stack.commands.test ??= exists(dir, 'spec') ? 'bundle exec rspec' : 'bin/rails test';
  }
  if (exists(dir, 'composer.json')) {
    stack.languages.push('PHP');
    if (exists(dir, 'artisan')) stack.frameworks.push('Laravel');
    stack.commands.test ??= exists(dir, 'artisan') ? 'php artisan test' : 'vendor/bin/phpunit';
  }
  if (exists(dir, 'pom.xml')) {
    stack.languages.push('Java');
    stack.commands.test ??= 'mvn test';
  }
  if (exists(dir, 'build.gradle') || exists(dir, 'build.gradle.kts')) {
    stack.languages.push(exists(dir, 'build.gradle.kts') ? 'Kotlin' : 'Java');
    stack.commands.test ??= './gradlew test';
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
    stack.languages.push('C#');
    stack.frameworks.push('.NET');
    stack.commands.test ??= 'dotnet test';
  }
  if (exists(dir, 'pubspec.yaml')) {
    stack.languages.push('Dart');
    stack.frameworks.push('Flutter');
    stack.commands.test ??= 'flutter test';
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.xcodeproj') || f === 'Package.swift')) {
    stack.languages.push('Swift');
  }
}

function detectTooling(dir, stack) {
  const agents = [
    ['CLAUDE.md', 'Claude Code'],
    ['.claude', 'Claude Code'],
    ['AGENTS.md', 'AGENTS.md'],
    ['.cursor', 'Cursor'],
    ['.cursorrules', 'Cursor'],
    ['GEMINI.md', 'Gemini CLI'],
    ['.github/copilot-instructions.md', 'GitHub Copilot'],
    ['.windsurfrules', 'Windsurf'],
    ['.kiro', 'Kiro'],
    ['.specify', 'Spec Kit'],
    ['.bmad-core', 'BMAD'],
    ['_bmad', 'BMAD'],
  ];
  for (const [f, name] of agents) if (exists(dir, f)) stack.existingAgentConfig.push(name);
  stack.existingAgentConfig = [...new Set(stack.existingAgentConfig)];
  stack.git = exists(dir, '.git');
  stack.ci = exists(dir, '.github/workflows') ? 'GitHub Actions' : exists(dir, '.gitlab-ci.yml') ? 'GitLab CI' : null;
  stack.docker = exists(dir, 'Dockerfile') || exists(dir, 'docker-compose.yml') || exists(dir, 'compose.yaml');
}

export function detect(dir) {
  const stack = {
    empty: isEmptyProject(dir),
    name: path.basename(path.resolve(dir)),
    languages: [],
    frameworks: [],
    ui: [],
    testing: [],
    packageManager: null,
    monorepo: false,
    commands: { test: null, lint: null, typecheck: null, build: null, dev: null },
    existingAgentConfig: [],
    git: false,
    ci: null,
    docker: false,
  };
  if (stack.empty) {
    detectTooling(dir, stack);
    return stack;
  }
  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg?.name) stack.name = pkg.name;
  detectNode(dir, stack);
  detectPython(dir, stack);
  detectOthers(dir, stack);
  detectTooling(dir, stack);
  stack.languages = [...new Set(stack.languages)];
  stack.frameworks = [...new Set(stack.frameworks)];
  return stack;
}

export function describeStack(stack) {
  if (stack.empty) return 'Empty project (greenfield)';
  const parts = [...stack.frameworks, ...stack.languages.filter((l) => !stack.frameworks.length || l !== 'JavaScript')];
  return parts.length ? parts.join(' · ') : 'Unknown stack';
}
