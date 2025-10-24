#!/usr/bin/env node
/*
 * send_sequence.mjs
 * Utility: spawn a command and send a sequence of inputs on timers.
 * Purposefully minimal and non-demo: it does one thing — write inputs to stdin
 * Usage:
 *   node scripts/send_sequence.mjs --cmd "node packages/cli/dist/index.js" --seq-file path/to/seq.json
 *   node scripts/send_sequence.mjs --cmd "node packages/cli/dist/index.js" --seq '[{"delay":1000,"input":"help\n"}]'
 * Options:
 *   --cmd       Command to run (string). Defaults to "node packages/cli/dist/index.js".
 *   --seq-file  Path to JSON file containing array of steps.
 *   --seq       JSON string for sequence (overrides seq-file).
 *   --dry-run   Print actions but don't spawn the command.
 * Sequence step format: { "delay": <ms>, "input": "..." }
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = { cmd: 'node packages/cli/dist/index.js', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cmd') {
      args.cmd = argv[++i];
    } else if (a === '--seq-file') {
      args.seqFile = argv[++i];
    } else if (a === '--seq') {
      args.seq = argv[++i];
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function usageAndExit() {
  console.log('Usage: node scripts/send_sequence.mjs [--cmd CMD] (--seq-file FILE | --seq JSON) [--dry-run]');
  process.exit(1);
}

function loadSequence(args) {
  let seq;
  if (args.seq) {
    seq = JSON.parse(args.seq);
  } else if (args.seqFile) {
    const raw = fs.readFileSync(path.resolve(args.seqFile), 'utf-8');
    seq = JSON.parse(raw);
  } else {
    usageAndExit();
  }
  // normalize: allow array of strings or objects
  if (!Array.isArray(seq)) throw new Error('Sequence must be an array');
  return seq.map((item) => {
    if (typeof item === 'string') return { delay: 0, input: item };
    return { delay: Number(item.delay || 0), input: String(item.input || '') };
  });
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.help) usageAndExit();
  const seq = loadSequence(args);

  console.log('send_sequence: command=', args.cmd);
  console.log('send_sequence: steps=', seq.length);

  if (args.dryRun) {
    console.log('Dry run - actions:');
    let t = 0;
    for (const s of seq) {
      t += s.delay;
      console.log(`  at +${t}ms -> write: ${JSON.stringify(s.input)}`);
    }
    return;
  }

  // split command into program and args (simple split)
  const parts = args.cmd.split(' ').filter(Boolean);
  const proc = spawn(parts[0], parts.slice(1), {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
    cwd: process.cwd(),
  });

  proc.on('error', (err) => {
    console.error('Failed to spawn command:', err);
    process.exit(1);
  });

  // sequentially send inputs
  let elapsed = 0;
  for (const step of seq) {
    if (step.delay > 0) {
      await sleep(step.delay);
      elapsed += step.delay;
    }
    // ensure trailing newline if not present (many TUI commands expect it)
    const text = step.input.endsWith('\n') ? step.input : step.input + '\n';
    try {
      proc.stdin.write(text);
      // small pause to let TUI consume input
      await sleep(10);
    } catch (err) {
      console.error('Error writing to child stdin:', err);
      break;
    }
  }

  // optionally close stdin to signal EOF
  try {
    proc.stdin.end();
  } catch (e) {
    // ignore
  }

  // wait for process to exit
  await new Promise((res) => proc.on('close', res));
}

if (process.argv[1] && process.argv[1].endsWith('send_sequence.mjs')) {
  run().catch((err) => {
    console.error('send_sequence failed:', err);
    process.exit(1);
  });
}
