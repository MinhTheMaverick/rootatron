'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProgress } = require('../frontend/fit-progress.js');

test('default timers preserve the browser timer receiver', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const context = vm.createContext({ module:{ exports:{} } });
  vm.runInContext(`
    function setTimeout(fn) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      globalThis.fire = fn;
      return 1;
    }
    function clearTimeout() {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
    }
  `, context);
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/fit-progress.js'), 'utf8'), context);
  const events = [];
  const fit = context.module.exports.createProgress({
    show() {}, update: title => events.push(title), hide() {},
  }).start();
  context.fire();
  assert.equal(events[0], 'Waiting for the server');
  fit.received();
  fit.finish();
});

function setup() {
  let now = 0, next = 0;
  const pending = new Map(), events = [];
  const timers = {
    setTimeout(fn, delay) { const id = ++next; pending.set(id, { at:now + delay, fn }); return id; },
    clearTimeout(id) { pending.delete(id); },
  };
  const progress = createProgress({
    show: title => events.push(['show', title]),
    update: (title, message) => events.push(['update', title, message]),
    hide: () => events.push(['hide']),
  }, timers);
  return { progress, events, pending, advance(ms) {
    now += ms;
    for (const [id, timer] of pending) if (timer.at <= now) { pending.delete(id); timer.fn(); }
  } };
}

test('shows progress immediately and explains free hosting only after 20 seconds', () => {
  const x = setup();
  x.progress.start();
  assert.deepEqual(x.events, [['show', 'Fitting']]);
  x.advance(19999);
  assert.equal(x.events.length, 1);
  x.advance(1);
  assert.match(x.events.at(-1)[2], /free server.*another 60 seconds/);
});

test('a server response cancels wake-up guidance even if drawing is slow', () => {
  const x = setup(), fit = x.progress.start();
  x.advance(1000);
  fit.received();
  x.advance(30000);
  assert.deepEqual(x.events.at(-1), ['update', 'Drawing plot', '']);
  fit.finish();
  assert.deepEqual(x.events.at(-1), ['hide']);
});

test('success, errors, and resets clear the timer and close progress', () => {
  for (const reset of [false, true]) {
    const x = setup(), fit = x.progress.start();
    if (reset) x.progress.finish(); else fit.finish();
    x.advance(30000);
    assert.deepEqual(x.events, [['show', 'Fitting'], ['hide']]);
    assert.equal(x.pending.size, 0);
  }
});

test('an older request cannot update or close a newer fit', () => {
  const x = setup(), old = x.progress.start();
  x.advance(19000);
  x.progress.start('Plotting histogram');
  old.received();
  old.finish();
  x.advance(1000);
  assert.deepEqual(x.events.at(-1), ['show', 'Plotting histogram']);
  x.advance(19000);
  assert.equal(x.events.at(-1)[1], 'Waiting for the server');
});
