import type { JSX } from 'preact';
import type { Op } from '../model/ops';
import type { ArrayS, BagS, GridS, ListS, MapS, Structure, TreeS, VarS } from '../model/types';
import { ArrayView } from './ArrayView';
import { BagView } from './BagView';
import { GridView } from './GridView';
import { ListView } from './ListView';
import { MapView } from './MapView';
import { TreeView } from './TreeView';
import { VarView } from './VarView';

export type ViewProps<S extends Structure = Structure> = { s: S; prev?: S; ro: boolean };

export function View({ s, prev, ro }: ViewProps): JSX.Element {
  switch (s.kind) {
    case 'var': return <VarView s={s} prev={prev as VarS | undefined} ro={ro} />;
    case 'array': return <ArrayView s={s} prev={prev as ArrayS | undefined} ro={ro} />;
    case 'grid': return <GridView s={s} prev={prev as GridS | undefined} ro={ro} />;
    case 'list': return <ListView s={s} prev={prev as ListS | undefined} ro={ro} />;
    case 'tree': return <TreeView s={s} prev={prev as TreeS | undefined} ro={ro} />;
    case 'map': return <MapView s={s} prev={prev as MapS | undefined} ro={ro} />;
    case 'set':
    case 'stack':
    case 'queue': return <BagView s={s} prev={prev as BagS | undefined} ro={ro} />;
    default: return <div class="lv-pending">{s.kind}</div>;
  }
}

export function cardMenu(_s: Structure): { label: string; op: Op }[] {
  return [];
}
