import type { VarS } from '../model/types';
import type { ViewProps } from './index';
import { Slot } from './Slot';

export function VarView({ s, prev, ro }: ViewProps<VarS>) {
  return (
    <Slot
      class="lv-var"
      at={{ s: s.id, k: 'var' }}
      val={s.value}
      text={s.value}
      ro={ro}
      drop
      changed={!!prev && prev !== s && prev.value !== s.value}
    />
  );
}
