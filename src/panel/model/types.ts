export type Id = string; // 's1', 's2', ...
export type NodeId = string; // 'n1', 'n2', ...
export type Val = string; // literal token as written: "7", "-3", "\"a\"", "null", "true"

export type PtrAt = number | [number, number] | NodeId | null;
export type Ptr = { name: string; at: PtrAt };

export type ListNode = { val: Val; next: NodeId | null };
export type TreeNode = { val: Val; left: NodeId | null; right: NodeId | null };
export type CallFrame = { fn: string; locals: [string, Val][] };

type Base = { id: Id; name: string };
export type ArrayS = Base & { kind: 'array'; items: Val[]; ptrs: Ptr[]; chars?: true };
export type GridS = Base & { kind: 'grid'; rows: Val[][]; marked: string[]; ptrs: Ptr[] };
export type ListS = Base & { kind: 'list'; nodes: Record<NodeId, ListNode>; ptrs: Ptr[] };
export type TreeS = Base & { kind: 'tree'; nodes: Record<NodeId, TreeNode>; ptrs: Ptr[] };
export type MapS = Base & { kind: 'map'; entries: [Val, Val][] };
export type BagS = Base & { kind: 'set' | 'stack' | 'queue'; items: Val[] };
export type VarS = Base & { kind: 'var'; value: Val };
export type CallsS = Base & { kind: 'calls'; frames: CallFrame[] };
export type Structure = ArrayS | GridS | ListS | TreeS | MapS | BagS | VarS | CallsS;
export type Kind = Structure['kind'];
export type PtrS = ArrayS | GridS | ListS | TreeS;

export type Board = { structs: Record<Id, Structure> };
export type Frame = { board: Board; line?: number };
export type Pos = { x: number; y: number };
export type View = { x: number; y: number; zoom: number };
export type Canvas = {
  v: 1;
  frames: Frame[]; // frames[0] is the board seeded from the input
  draft: Board; // edits since the last frame
  layout: Record<Id, Pos>;
  view: View;
};
