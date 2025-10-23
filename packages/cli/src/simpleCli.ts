#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import pc from 'picocolors';

// Minimal JSON tree printer
function printTree(obj: any, indent = '') {
  if (obj === null) {
    console.log(indent + pc.dim('null'));
    return;
  }
  if (typeof obj !== 'object') {
    console.log(indent + pc.cyan(String(obj)));
    return;
  }
  if (Array.isArray(obj)) {
    console.log(indent + pc.yellow('[Array]'));
    for (let i = 0; i < obj.length; i++) {
      process.stdout.write(indent + '  ' + pc.gray(String(i) + ': '));
      printTree(obj[i], indent + '  ');
    }
    return;
  }
  console.log(indent + pc.green('{'));
  for (const [k, v] of Object.entries(obj)) {
    process.stdout.write(indent + '  ' + pc.magenta(k) + ': ');
    if (typeof v === 'object' && v !== null) {
      printTree(v, indent + '  ');
    } else {
      console.log(pc.cyan(String(v)));
    }
  }
  console.log(indent + pc.green('}'));
}

function loadProvidersJson() {
  const file = path.resolve(process.cwd(), 'providers.json');
  if (!fs.existsSync(file)) return { error: 'providers.json not found' };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { error: String(e) };
  }
}

async function main() {
  console.log(pc.bold(pc.blue('Simple Wren CLI')) + ' — type `help`');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const providers = loadProvidersJson();

  rl.setPrompt('> ');
  rl.prompt();

  rl.on('line', (line) => {
    const cmd = line.trim();
    if (!cmd) { rl.prompt(); return; }
    if (cmd === 'quit' || cmd === 'exit') {
      rl.close();
      return;
    }
    if (cmd === 'help') {
      console.log('Commands:');
      console.log('  providers   - show providers.json as tree');
      console.log('  quotas      - show providers quotas (if present)');
      console.log('  meta        - show providers meta');
      console.log('  stats       - show providers stats');
      console.log('  reload      - reload providers.json');
      console.log('  exit|quit   - quit');
      rl.prompt();
      return;
    }
    if (cmd === 'providers') {
      if ((providers as any).error) console.log(pc.red((providers as any).error));
      else printTree(providers);
      rl.prompt();
      return;
    }
    if (cmd === 'reload') {
      const p = loadProvidersJson();
      Object.assign((providers as any), p);
      console.log(pc.green('reloaded'));
      rl.prompt();
      return;
    }
    if (cmd === 'quotas') {
      if ((providers as any).error) console.log(pc.red((providers as any).error));
      else printTree((providers as any).quotas ?? {});
      rl.prompt();
      return;
    }
    if (cmd === 'meta') {
      if ((providers as any).error) console.log(pc.red((providers as any).error));
      else printTree((providers as any).meta ?? {});
      rl.prompt();
      return;
    }
    if (cmd === 'stats') {
      if ((providers as any).error) console.log(pc.red((providers as any).error));
      else printTree((providers as any).stats ?? {});
      rl.prompt();
      return;
    }
    console.log(pc.yellow('Unknown command') + ': ' + cmd);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(pc.dim('Goodbye'));
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
