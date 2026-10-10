import { useSignal } from '@preact/signals';
import { Component } from 'preact';
import { useRef } from 'preact/hooks';
import { pointerDrag } from '../drag/drag';
import { selKey } from '../model/loc';
import type { Op } from '../model/ops';
import type { Pos, Structure } from '../model/types';
import { act, canvas, moveCard } from '../state';
import { editing, refocus, startEdit } from '../ui';
import { Edit } from '../views/Edit';
import { cardMenu, View } from '../views/index';

type CardProps = { s: Structure; prev?: Structure; isNew: boolean; pos?: Pos; ro: boolean };

const px = (n: number) => `${n}px`;

function CardMenu({ items, name, ro }: { items: { label: string; op: Op }[]; name: string; ro: boolean }) {
  const open = useSignal(false);
  return (
    <span
      class="lv-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open.value) {
          e.stopPropagation();
          open.value = false;
        }
      }}
    >
      <button
        type="button"
        class="lv-ctrl"
        aria-label={`${name} menu`}
        aria-haspopup="menu"
        aria-expanded={open.value}
        disabled={ro}
        onClick={() => (open.value = !open.value)}
      >
        ⋯
      </button>
      {open.value && !ro && (
        <span class="lv-menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              class="lv-menu-item"
              onClick={() => {
                open.value = false;
                act(it.op);
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function CardImpl({ s, prev, isNew, pos, ro }: CardProps) {
  const sel = { t: 'card', s: s.id } as const;
  const key = selKey(sel);
  const ref = useRef<HTMLElement>(null);
  const same = prev && prev.kind === s.kind ? prev : undefined;
  const outlined = isNew || (!!prev && prev.kind !== s.kind) || (!!same && same.name !== s.name);
  const menu = cardMenu(s);
  const renaming = editing.value === key;
  return (
    <section
      ref={ref}
      class={outlined ? 'lv-card lv-changed-card' : 'lv-card'}
      data-card={s.id}
      data-kind={s.kind}
      style={{ left: px(pos?.x ?? 0), top: px(pos?.y ?? 0), visibility: pos ? 'visible' : 'hidden' }}
    >
      <header
        class="lv-card-head"
        tabIndex={0}
        data-sel={key}
        aria-label={`${s.name} card`}
        onPointerDown={(e) => {
          const el = ref.current;
          if (!pos || !el || (e.target as Element).closest('button, input')) return;
          const start = pos;
          const zoom = canvas.value!.view.zoom;
          let to: Pos | null = null;
          // Move the card by style while dragging, so its body doesn't re-render on every pointermove.
          // Preact leaves these styles alone until the saved position changes.
          const show = (p: Pos) => {
            el.style.left = px(p.x);
            el.style.top = px(p.y);
          };
          pointerDrag(e, {
            move: (_ev, dx, dy) => show((to = { x: start.x + dx / zoom, y: start.y + dy / zoom })),
            end: (_ev, moved) => {
              if (moved && to) moveCard(s.id, to);
            },
            cancel: () => show(start),
          });
        }}
      >
        {renaming ? (
          <Edit
            value={s.name}
            label="Rename card"
            onCommit={(v) => {
              if (editing.value !== key) return; // removed by a canvas switch; Chrome still fires blur
              editing.value = null;
              act({ t: 'rename', s: s.id, name: v });
              refocus(sel);
            }}
            onCancel={() => {
              editing.value = null;
              refocus(sel);
            }}
          />
        ) : (
          <span class="lv-card-name" data-testid="card-name" onDblClick={() => startEdit(sel)}>
            {s.name}
          </span>
        )}
        {menu.length > 0 && <CardMenu items={menu} name={s.name} ro={ro} />}
        <button
          type="button"
          class="lv-x"
          aria-label={`Delete ${s.name}`}
          title="Delete"
          disabled={ro}
          onClick={() => {
            if (act({ t: 'remove', s: s.id })) refocus(null);
          }}
        >
          ×
        </button>
      </header>
      <div class="lv-card-body">
        <View s={s} prev={same} ro={ro} />
      </div>
    </section>
  );
}

// Re-renders only when a prop changes by reference, so scrubbing redraws only the structures that
// differ. This is what preact/compat's memo does, without loading compat (see Global Constraints).
export class Card extends Component<CardProps> {
  shouldComponentUpdate(p: CardProps): boolean {
    const q = this.props;
    return p.s !== q.s || p.prev !== q.prev || p.isNew !== q.isNew || p.pos !== q.pos || p.ro !== q.ro;
  }

  render() {
    const { s, prev, isNew, pos, ro } = this.props;
    return <CardImpl s={s} prev={prev} isNew={isNew} pos={pos} ro={ro} />;
  }
}
