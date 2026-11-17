// Sonidos sintetizados con Web Audio API, con volumen y silencio.
import { prefs, setPref } from './store.js';

let ctx = null;
let master = null;
let muted = prefs('muted', false);
let volume = prefs('volume', 0.7);

export const isMuted = () => muted;
export const getVolume = () => volume;

export function setMuted(v) {
  muted = v;
  setPref('muted', v);
  if (master) master.gain.value = muted ? 0 : volume;
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  setPref('volume', volume);
  if (master) master.gain.value = muted ? 0 : volume;
}

function ac() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { start = 0, dur = 0.12, type = 'sine', gain = 0.15, slide = null } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  tick() { tone(1100, { dur: 0.05, type: 'square', gain: 0.05 }); },
  tock() { tone(700, { dur: 0.06, type: 'square', gain: 0.06 }); },
  correct() { [660, 880, 1320].forEach((f, i) => tone(f, { start: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.12 })); },
  otherCorrect() { tone(990, { dur: 0.12, type: 'triangle', gain: 0.08 }); tone(1320, { start: 0.08, dur: 0.14, type: 'triangle', gain: 0.08 }); },
  close() { tone(520, { dur: 0.1, type: 'sine', gain: 0.1 }); tone(560, { start: 0.1, dur: 0.12, gain: 0.1 }); },
  turnEnd() { [784, 659, 523].forEach((f, i) => tone(f, { start: i * 0.12, dur: 0.2, type: 'triangle', gain: 0.1 })); },
  yourTurn() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.08, dur: 0.18, type: 'square', gain: 0.06 })); },
  join() { tone(880, { dur: 0.08, gain: 0.08 }); tone(1175, { start: 0.07, dur: 0.12, gain: 0.08 }); },
  hint() { tone(1500, { dur: 0.1, slide: 2200, gain: 0.06 }); },
  pop() { tone(300, { dur: 0.08, slide: 900, gain: 0.08 }); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, { start: i * 0.11, dur: 0.22, type: 'triangle', gain: 0.1 })); },
  message() { tone(1250, { dur: 0.05, gain: 0.04 }); },
};
