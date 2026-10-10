import type { JSX } from 'preact';
import type { Op } from '../model/ops';
import type { Structure } from '../model/types';

export type ViewProps<S extends Structure = Structure> = { s: S; prev?: S; ro: boolean };

export function View({ s }: ViewProps): JSX.Element {
  switch (s.kind) {
    default: return <div class="lv-pending">{s.kind}</div>;
  }
}

export function cardMenu(_s: Structure): { label: string; op: Op }[] {
  return [];
}
