export type Param = { name: string; type: string };
export type Meta = {
  name?: string;
  params?: Param[];
  classname?: string;
  manual?: boolean;
  systemdesign?: boolean;
};
