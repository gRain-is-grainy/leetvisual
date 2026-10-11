import type { Ref } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createStruct, DEFAULT_NAMES, uniqueName, type CreateOpts } from '../model/create';
import { structIds } from '../model/history';
import { nextId } from '../model/ids';
import type { Kind } from '../model/types';
import { act, canvas, readOnly, shown } from '../state';
import { MAX_GRID, MAX_ITEMS } from '../views/limits';

const KINDS: [Kind, string][] = [
  ['var', 'Variable'], ['array', 'Array'], ['grid', 'Grid'], ['map', 'Map'], ['set', 'Set'],
  ['stack', 'Stack'], ['queue', 'Queue'], ['list', 'Linked list'], ['tree', 'Binary tree'], ['calls', 'Call stack'],
];

type Sized = 'array' | 'grid';

export function AddMenu() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Sized | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function close(refocus = true) {
    setOpen(false);
    setForm(null);
    if (refocus) button.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    if (!form) menu.current?.querySelector('button')?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, form]);

  // Chrome blurs a focused element that is removed, so park focus on the button before the form replaces the list.
  function openForm(kind: Sized) {
    button.current?.focus();
    setForm(kind);
  }

  function add(kind: Kind, opts: CreateOpts = {}) {
    const c = canvas.value;
    const b = shown.value;
    if (!c || !b) return;
    const id = nextId('s', structIds(c));
    act({ t: 'add', struct: createStruct(kind, opts, id, uniqueName(DEFAULT_NAMES[kind], b)) });
    close();
  }

  return (
    <div
      class="lv-add"
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        close();
      }}
      // Tab past the last item or a click into the LeetCode page (relatedTarget null) closes it too.
      onFocusOut={(e) => {
        if (open && !root.current?.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <button
        ref={button}
        type="button"
        class="lv-ctrl"
        data-testid="add-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={readOnly.value || !canvas.value}
        onClick={() => (open ? close() : setOpen(true))}
      >
        + Add
      </button>
      {open && !form && (
        // tabIndex -1: a click on the popup's padding focuses it instead of the body, which would close it.
        <div class="lv-add-list" role="menu" ref={menu} tabIndex={-1}>
          {KINDS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              class="lv-menu-item"
              onClick={() => (kind === 'array' || kind === 'grid' ? openForm(kind) : add(kind))}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {open && form && <SizeForm kind={form} onSubmit={(o) => add(form, o)} />}
    </div>
  );
}

function SizeForm({ kind, onSubmit }: { kind: Sized; onSubmit(o: CreateOpts): void }) {
  const [length, setLength] = useState('5');
  const [rows, setRows] = useState('3');
  const [cols, setCols] = useState('3');
  const [fill, setFill] = useState('0');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const num = (label: string, value: string, set: (v: string) => void, max: number, ref?: Ref<HTMLInputElement>) => (
    <label>
      {label}
      <input ref={ref} type="number" min={0} max={max} value={value} onInput={(e) => set(e.currentTarget.value)} />
    </label>
  );
  const cap = (v: string, max: number) => Math.min(Number(v), max);

  return (
    <form
      class="lv-add-list lv-add-form"
      tabIndex={-1}
      aria-label={kind === 'array' ? 'New array' : 'New grid'}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          kind === 'array'
            ? { length: cap(length, MAX_ITEMS), fill }
            : { rows: cap(rows, MAX_GRID), cols: cap(cols, MAX_GRID), fill },
        );
      }}
    >
      {kind === 'array' ? (
        num('Length', length, setLength, MAX_ITEMS, first)
      ) : (
        <>
          {num('Rows', rows, setRows, MAX_GRID, first)}
          {num('Columns', cols, setCols, MAX_GRID)}
        </>
      )}
      <label>
        Fill
        <input value={fill} onInput={(e) => setFill(e.currentTarget.value)} />
      </label>
      <button type="submit" class="lv-ctrl">Add</button>
    </form>
  );
}
