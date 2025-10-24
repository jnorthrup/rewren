#!/usr/bin/env node
// Minimal Lisp-like evaluator for demo purposes
// Supports: numbers, symbols, (+ - * /), define, lambda, if, =, >, <, quote, print

function tokenize(input) {
  return input
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/);
}

function parse(tokens) {
  if (tokens.length === 0) throw new SyntaxError('Unexpected EOF');
  const token = tokens.shift();
  if (token === '(') {
    const L = [];
    while (tokens[0] !== ')') {
      L.push(parse(tokens));
      if (tokens.length === 0) throw new SyntaxError('Missing )');
    }
    tokens.shift(); // pop ')'
    return L;
  } else if (token === ')') {
    throw new SyntaxError('Unexpected )');
  } else {
    return atom(token);
  }
}

function atom(token) {
  if (/^-?\d+$/.test(token)) return Number(token);
  if (/^-?\d+\.\d+$/.test(token)) return Number(token);
  return String(token);
}

function standardEnv() {
  const env = new Map();
  env.set('+', (...args) => args.reduce((a, b) => a + b, 0));
  env.set('-', (a, b) => a - b);
  env.set('*', (...args) => args.reduce((a, b) => a * b, 1));
  env.set('/', (a, b) => a / b);
  env.set('>', (a, b) => a > b);
  env.set('<', (a, b) => a < b);
  env.set('=', (a, b) => a === b);
  env.set('print', (...args) => { console.log(...args); return null; });
  return env;
}

class Env {
  constructor(parms = [], args = [], outer = null) {
    this.map = new Map();
    for (let i = 0; i < parms.length; i++) this.map.set(parms[i], args[i]);
    this.outer = outer;
  }
  find(key) {
    if (this.map.has(key)) return this.map;
    if (this.outer) return this.outer.find(key);
    return null;
  }
  get(key) {
    const m = this.find(key);
    if (m) return m.get(key);
    throw new ReferenceError(`Unbound symbol: ${key}`);
  }
  set(key, val) { this.map.set(key, val); }
}

function evaluate(x, env) {
  env = env || new Env([], [], new Env([], [], null));
  // If symbol
  if (typeof x === 'string') return env.get(x);
  // If number
  if (typeof x === 'number') return x;
  // If list
  if (!Array.isArray(x)) throw new Error('Invalid expression');

  if (x.length === 0) return null;

  const first = x[0];
  if (first === 'quote') return x[1];
  if (first === 'if') {
    const [, test, conseq, alt] = x;
    const result = evaluate(test, env) ? evaluate(conseq, env) : evaluate(alt, env);
    return result;
  }
  if (first === 'define') {
    const [, name, exp] = x;
    const val = evaluate(exp, env);
    env.set(name, val);
    return val;
  }
  if (first === 'lambda') {
    const [, parms, body] = x;
    return function(...args) {
      const local = new Env(parms, args, env);
      return evaluate(body, local);
    };
  }

  // Procedure call
  const proc = evaluate(first, env);
  const args = x.slice(1).map((arg) => evaluate(arg, env));
  if (typeof proc === 'function') return proc(...args);
  throw new TypeError('Attempt to call non-function');
}

export function run(input) {
  const tokens = tokenize(input);
  const ast = parse(tokens);
  const baseEnv = new Env([], [], null);
  // populate standard env
  const senv = standardEnv();
  for (const [k, v] of senv.entries()) baseEnv.set(k, v);
  // allow pre-defined math constants
  baseEnv.set('PI', Math.PI);
  return evaluate(ast, baseEnv);
}

if (process.argv[1] && process.argv[1].endsWith('eval_interpreter.mjs')) {
  // CLI demo: read a small program from args or stdin
  const expr = process.argv.slice(2).join(' ') || '(print (+ 1 2 3))';
  try {
    run(expr);
  } catch (err) {
    console.error('Error evaluating:', err);
    process.exit(1);
  }
}
