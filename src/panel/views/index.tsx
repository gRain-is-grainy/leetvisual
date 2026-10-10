import type { JSX } from 'preact';
import type { Op } from '../model/ops';
import type { ArrayS, Structure, VarS } from '../model/types';
import { ArrayView } from './ArrayView';
import { VarView } from './VarView';

export type ViewProps<S extends Structure = Structure> = { s: S; prev?: S; ro: boolean };

export function View({ s, prev, ro }: ViewProps): JSX.Element {
  switch (s.kind) {
    case 'var': return <VarView s={s} prev={prev as VarS | undefined} ro={ro} />;
    case 'array': return <ArrayView s={s} prev={prev as ArrayS | undefined} ro={ro} />;
    default: return <div class="lv-pending">{s.kind}</div>;
  }
}

export function cardMenu(_s: Structure): { label: string; op: Op }[] {
  return [];
}
