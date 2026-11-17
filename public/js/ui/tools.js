// Barra de herramientas del dibujante, con atajos de teclado.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import { prefs, setPref } from '../store.js';

export const PALETTE = [
  '#ffffff', '#c1c1c1', '#7a7a7a', '#1b1b2f', '#ef130b', '#8b0000', '#ff7100', '#a0522d',
  '#ffe400', '#c8a400', '#00cc00', '#006400', '#00ff91', '#2ec4b6', '#00b2ff', '#004fd6',
  '#1c1c8c', '#a300ba', '#5e1a7a', '#ff69b4', '#d4006a', '#ffc8a2', '#e0a37a', '#a86b44',
  '#5c3a21', '#9ef01a', '#90e0ef', '#cdb4db', '#ffafcc', '#fff1a8', '#ffd6a5', '#bde0fe',
];
const SIZES = [2, 4, 8, 14, 22, 34, 50];

const TOOL_LIST = [
  ['pen', '✏️', 'b'], ['eraser', '🧽', 'e'], ['fill', '🪣', 'f'], ['picker', '💧', 'i'],
  ['highlighter', '🖍️', 'h'], ['spray', '💨', 's'], ['dashed', '┅', 'd'],
  ['line', '╱', 'l'], ['rect', '▭', 'r'], ['ellipse', '◯', 'o'], ['tri', '△', 't'],
];

export function createTools(container, { onCommand, onChange }) {
  const state = {
    tool: 'pen',
    color: '#1b1b2f',
    size: 8,
    opacity: 1,
    tolerance: 32,
    fillShape: false,
    symmetry: false,
    recent: prefs('recent', []),
  };
  let enabled = false;
  let expanded = prefs('toolsExpanded', true);
  let prevTool = 'pen';
  const el = h('section', { class: 'tools', 'aria-label': 'Herramientas de dibujo' });
  container.append(el);

  function set(patch) {
    Object.assign(state, patch);
    render();
    onChange?.(state);
  }

  function setColor(color) {
    const c = color.toLowerCase();
    state.recent = [c, ...state.recent.filter((x) => x !== c)].slice(0, 8);
    setPref('recent', state.recent);
    set({ color: c });
  }

  function btn(label, content, onClick, { pressed = null, cls = '', key = '' } = {}) {
    return h('button', {
      type: 'button',
      class: ['tool-btn', cls],
      title: label,
      'aria-label': label,
      'aria-pressed': pressed === null ? null : String(pressed),
      'aria-keyshortcuts': key || null,
      on: { click: onClick },
    }, content);
  }

  /** Deslizador que no re-renderiza mientras se arrastra (así no se corta el gesto). */
  function slider(labelFn, min, max, value, apply) {
    const label = h('span', {}, labelFn());
    const input = h('input', {
      type: 'range', min: String(min), max: String(max), value: String(value),
      on: {
        input: (e) => {
          apply(Number(e.target.value));
          label.textContent = labelFn();
          onChange?.(state);
        },
        change: () => render(),
      },
    });
    return h('label', { class: 'slider' }, label, input);
  }

  function render() {
    clear(el);
    el.classList.toggle('disabled', !enabled);
    el.classList.toggle('collapsed', !expanded);
    const tools = h('div', { class: 'tool-row tool-list', role: 'toolbar', 'aria-label': 'Herramientas' },
      TOOL_LIST.map(([id, icon, key]) => btn(t(`tools.${id}`), icon, () => {
        if (id === 'picker') prevTool = state.tool;
        set({ tool: id });
      }, { pressed: state.tool === id, key, cls: `t-${id}` })),
      h('span', { class: 'sep' }),
      btn(t('tools.fillShape'), '◼', () => set({ fillShape: !state.fillShape }), { pressed: state.fillShape }),
      btn(t('tools.symmetry'), '🪞', () => set({ symmetry: !state.symmetry }), { pressed: state.symmetry, key: 'm' }),
      h('span', { class: 'sep' }),
      btn(t('tools.undo'), '↶', () => onCommand('undo'), { key: 'Control+Z' }),
      btn(t('tools.redo'), '↷', () => onCommand('redo'), { key: 'Control+Y' }),
      btn(t('tools.clear'), '🗑️', () => onCommand('clr'), { cls: 'danger' }),
      btn(t('tools.more'), expanded ? '▴' : '▾', () => {
        expanded = !expanded;
        setPref('toolsExpanded', expanded);
        render();
      }, { cls: 'more' }));

    const sizeRow = h('div', { class: 'tool-row' },
      h('div', { class: 'sizes', role: 'group', 'aria-label': t('tools.size') },
        SIZES.map((s) => h('button', {
          type: 'button', class: 'size-btn', title: `${s}px`, 'aria-label': `${t('tools.size')} ${s}`,
          'aria-pressed': String(state.size === s), on: { click: () => set({ size: s }) },
        }, h('i', { style: { width: `${Math.max(3, Math.min(26, s * 0.55))}px`, height: `${Math.max(3, Math.min(26, s * 0.55))}px`, background: state.color } })))),
      slider(() => `${t('tools.size')}: ${state.size}`, 1, 100, state.size, (v) => { state.size = v; }),
      slider(() => `${t('tools.opacity')}: ${Math.round(state.opacity * 100)}%`, 5, 100, Math.round(state.opacity * 100), (v) => { state.opacity = v / 100; }),
      state.tool === 'fill' ? slider(() => `${t('tools.tolerance')}: ${state.tolerance}`, 0, 128, state.tolerance, (v) => { state.tolerance = v; }) : null);

    const colorInput = h('input', {
      type: 'color', value: state.color, 'aria-label': t('tools.color'), title: t('tools.color'),
      on: { change: (e) => setColor(e.target.value) },
    });
    const hexInput = h('input', {
      class: 'hex', value: state.color, maxlength: '7', 'aria-label': 'Hex', spellcheck: 'false',
      on: { change: (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value.trim())) setColor(e.target.value.trim()); } },
    });
    const palette = h('div', { class: 'tool-row palette-row' },
      h('div', { class: 'current-color', style: { background: state.color }, title: state.color, 'aria-hidden': 'true' }),
      h('div', { class: 'palette', role: 'group', 'aria-label': 'Paleta' },
        PALETTE.map((c, i) => h('button', {
          type: 'button', class: 'swatch', style: { background: c }, title: i < 10 ? `${c} (${(i + 1) % 10})` : c,
          'aria-label': `Color ${c}`, 'aria-pressed': String(state.color === c), on: { click: () => setColor(c) },
        }))),
      h('div', { class: 'custom-color' }, colorInput, hexInput),
      state.recent.length ? h('div', { class: 'recent', role: 'group', 'aria-label': t('tools.recent') },
        state.recent.map((c) => h('button', { type: 'button', class: 'swatch small', style: { background: c }, 'aria-label': c, title: c, on: { click: () => setColor(c) } }))) : null);

    el.append(tools, h('div', { class: 'tool-extra' }, sizeRow, palette));
  }

  function onKey(e) {
    if (!enabled) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      onCommand(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      onCommand('redo');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = TOOL_LIST.find(([, , key]) => key === k);
    if (tool) {
      if (tool[0] === 'picker') prevTool = state.tool;
      set({ tool: tool[0] });
    } else if (k === 'm') set({ symmetry: !state.symmetry });
    else if (k === '[') set({ size: Math.max(1, state.size - (state.size > 20 ? 4 : 1)) });
    else if (k === ']') set({ size: Math.min(100, state.size + (state.size >= 20 ? 4 : 1)) });
    else if (/^[0-9]$/.test(k)) setColor(PALETTE[(Number(k) + 9) % 10]);
  }
  document.addEventListener('keydown', onKey);
  render();

  return {
    el,
    state,
    setEnabled(v) {
      enabled = v;
      render();
    },
    pick(color) {
      setColor(color);
      set({ tool: prevTool === 'picker' ? 'pen' : prevTool });
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
    },
  };
}
