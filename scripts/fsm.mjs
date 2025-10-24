#!/usr/bin/env node
/*
 * Finite State Machine implementation (no demos)
 * - Async-aware transition handlers and guards
 * - onEnter/onExit hooks per-state
 * - dispatch(event, payload) returns a Promise that resolves when transition completes
 *
 * Usage (in code):
 *   import { FSM } from './scripts/fsm.mjs';
 *   const f = new FSM({ state: 'idle' });
 *   f.addState('idle', { onEnter: () => console.log('enter idle') });
 *   f.addTransition('start', 'idle', 'running', { action: async (p) => {...} });
 *   await f.dispatch('start', { some: 'payload' });
 */

export class FSM {
  constructor(opts = {}) {
    this.state = opts.state || null;
    this.states = new Map(); // stateName -> { onEnter, onExit }
    this.transitions = []; // { event, from, to, guard?, action? }
    this.busy = false;
  }

  addState(name, { onEnter = null, onExit = null } = {}) {
    this.states.set(name, { onEnter, onExit });
    if (this.state === null) this.state = name;
  }

  addTransition(event, from, to, { guard = null, action = null } = {}) {
    this.transitions.push({ event, from, to, guard, action });
  }

  getState() {
    return this.state;
  }

  // find a transition that matches current state and event
  _findTransition(event) {
    for (const t of this.transitions) {
      const fromMatch = Array.isArray(t.from) ? t.from.includes(this.state) : t.from === this.state || t.from === '*';
      if (t.event === event && fromMatch) return t;
    }
    return null;
  }

  async dispatch(event, payload) {
    if (this.busy) throw new Error('FSM is busy processing another event');
    const transition = this._findTransition(event);
    if (!transition) {
      throw new Error(`No transition for event '${event}' from state '${this.state}'`);
    }

    // guard check
    if (transition.guard) {
      const ok = await transition.guard({ from: this.state, to: transition.to, event, payload, fsm: this });
      if (!ok) return { ok: false, reason: 'guard-blocked' };
    }

    // perform transition
    this.busy = true;
    const fromState = this.state;
    const toState = transition.to;

    // run onExit of from state
    try {
      const fromMeta = this.states.get(fromState);
      if (fromMeta && typeof fromMeta.onExit === 'function') {
        await fromMeta.onExit({ from: fromState, to: toState, event, payload, fsm: this });
      }

      // run transition action
      if (transition.action) {
        await transition.action({ from: fromState, to: toState, event, payload, fsm: this });
      }

      // change state
      this.state = toState;

      // run onEnter of to state
      const toMeta = this.states.get(toState);
      if (toMeta && typeof toMeta.onEnter === 'function') {
        await toMeta.onEnter({ from: fromState, to: toState, event, payload, fsm: this });
      }
    } finally {
      this.busy = false;
    }

    return { ok: true, from: fromState, to: toState };
  }
}

// If run directly, print a short usage note (no demo output)
if (process.argv[1] && process.argv[1].endsWith('fsm.mjs')) {
  console.log('scripts/fsm.mjs - Finite State Machine library. Import and use in code; this file is not a demo.');
}
