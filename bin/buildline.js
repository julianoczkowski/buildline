#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import pc from 'picocolors';
import * as cli from '../src/cli.js';
import { VERSION } from '../src/install.js';

const HELP = `
${pc.bold('buildline')}: install an AI software factory into any project  ${pc.dim('v' + VERSION)}

${pc.bold('Usage')}
  npx buildline [command] [options]

${pc.bold('Commands')}
  ${pc.cyan('(none)')}                   interactive menu (sets up a factory if there isn't one)
  ${pc.cyan('init')}                     install the factory into this project
  ${pc.cyan('status')}                   show features, stations and what's next
  ${pc.cyan('new')} "<title>"            open a feature  ${pc.dim('--type fix|feature|epic  --owner <name>  --parent <id>')}
  ${pc.cyan('approve')} <id> <stage>     record a human approval (spec | design | plan | sensitive)  ${pc.dim('--by <name>')}
  ${pc.cyan('move')} <id> <station>      move a feature to a station  ${pc.dim('--note "<why>"')}
  ${pc.cyan('drop')} <id> "<why>"         record that a feature won't ship  ${pc.dim('--by <name>  --branch <name>')}
  ${pc.cyan('reopen')} <id> <station>    put a dropped feature back on the line  ${pc.dim('--note "<why>"')}
  ${pc.cyan('watch')}                    live view of the line in your terminal  ${pc.dim('--shipped  --once  --no-intro  --quiet')}
  ${pc.cyan('ui')}                       open the dashboard in your browser  ${pc.dim('--port <n>  --no-open  --quiet')}
  ${pc.cyan('step')} <station> [id]      open a station in the CLI and model set for it  ${pc.dim('--model <m>  --headless  --print')}
  ${pc.cyan('models')}                   choose models per station  ${pc.dim('set <station|phase> <model> · check')}
  ${pc.cyan('sound')} [on|off]           chime when a feature needs you or ships (watch and dashboard)
  ${pc.cyan('run')} [id]                 autopilot: build → verify → review with Claude Code /goal  ${pc.dim('--headless  --print')}
  ${pc.cyan('gates')} [names...]         run the quality gates
  ${pc.cyan('doctor')}                   check the setup
  ${pc.cyan('update')}                   refresh managed files (keeps your edits)
  ${pc.cyan('remove')}                   uninstall (keeps your features and context)

${pc.bold('Init options')}
  -y, --yes                accept detected defaults, no prompts
  --agents <list>          claude,codex,cursor,gemini,copilot
  --autonomy <1-4>         1 assist · 2 guided · 3 autopilot · 4 dark factory
  --team <list>            developer,designer,pm
  --models <list>          e.g. planning=fable,building=claude-opus-5-5,checking=codex
  --ci / --no-ci           add the GitHub Actions workflow
  --dry-run                show what would change without writing
  --force                  overwrite managed files even if you edited them
  -C, --cwd <dir>          run in another directory

${pc.bold('Examples')}
  npx buildline                       ${pc.dim('# guided setup or the menu')}
  npx buildline init -y --autonomy 3  ${pc.dim('# non-interactive install')}
  npx buildline new "Saved carts"     ${pc.dim('# open a feature')}
  npx buildline run 004               ${pc.dim('# unattended build loop')}
  npx buildline models set planning fable  ${pc.dim('# Fable specs, designs and plans')}
  npx buildline step review 004       ${pc.dim('# run one station on its model')}
`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: 'boolean', short: 'y' },
    agents: { type: 'string' },
    autonomy: { type: 'string' },
    team: { type: 'string' },
    models: { type: 'string' },
    model: { type: 'string', short: 'm' },
    ci: { type: 'boolean' },
    'no-ci': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    force: { type: 'boolean' },
    cwd: { type: 'string', short: 'C' },
    type: { type: 'string', short: 't' },
    owner: { type: 'string' },
    parent: { type: 'string' },
    by: { type: 'string' },
    note: { type: 'string' },
    branch: { type: 'string' },
    port: { type: 'string' },
    'no-open': { type: 'boolean' },
    headless: { type: 'boolean' },
    print: { type: 'boolean' },
    json: { type: 'boolean' },
    once: { type: 'boolean' },
    shipped: { type: 'boolean' },
    'no-intro': { type: 'boolean' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

const root = path.resolve(opts.cwd || process.cwd());
const o = { ...opts, dryRun: opts['dry-run'], ci: opts['no-ci'] ? false : opts.ci, open: !opts['no-open'], intro: !opts['no-intro'], sound: !opts.quiet };
const [cmd, ...rest] = positionals;

async function main() {
  if (opts.version) return console.log(VERSION);
  if (opts.help || cmd === 'help') return console.log(HELP);
  switch (cmd) {
    case undefined:
      return cli.home(root);
    case 'init':
      return cli.init(root, o);
    case 'status':
    case 'st':
      return cli.status(root, o);
    case 'new':
      return cli.newFeature(root, rest.join(' ') || null, o);
    case 'approve':
      if (rest.length < 2) throw new Error('Usage: buildline approve <id> <spec|design|plan|sensitive>');
      return cli.approveFeature(root, rest[0], rest[1], o);
    case 'move':
      if (rest.length < 2) throw new Error('Usage: buildline move <id> <station>');
      return cli.moveFeature(root, rest[0], rest[1], o);
    case 'drop':
      if (rest.length < 2) throw new Error('Usage: buildline drop <id> "<why>" [--by <name>] [--branch <name>]');
      return cli.dropCommand(root, rest[0], rest.slice(1).join(' '), o);
    case 'reopen':
      if (rest.length < 2) throw new Error('Usage: buildline reopen <id> <station>');
      return cli.reopenCommand(root, rest[0], rest[1], o);
    case 'watch':
    case 'top':
    case 'tui':
      return cli.watch(root, o);
    case 'ui':
    case 'dashboard':
      return (await import('../src/server.js')).serve(root, o);
    case 'step':
      if (!rest[0]) throw new Error('Usage: buildline step <station> [id]');
      return cli.step(root, rest[0], rest[1], o);
    case 'models':
      return cli.models(root, rest, o);
    case 'run':
      return cli.run(root, rest[0], o);
    case 'sound':
      return cli.sound(root, rest[0]);
    case 'gates':
      return cli.gates(root, rest);
    case 'doctor':
      return cli.doctor(root);
    case 'update':
      return cli.update(root, o);
    case 'remove':
    case 'uninstall':
      return cli.remove(root, o);
    default:
      console.log(HELP);
      throw new Error(`Unknown command "${cmd}".`);
  }
}

main().catch((err) => {
  console.error(`${pc.red('✘')} ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exitCode = 1;
});
