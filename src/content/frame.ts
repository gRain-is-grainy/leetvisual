export const FRAME_ATTR = 'data-leetvisual-frame';

export type Box = { left: number; top: number; width: number; height: number };

export function createFrame(doc: Document, src: string): HTMLIFrameElement {
  const frame = doc.createElement('iframe');
  frame.setAttribute(FRAME_ATTR, '');
  frame.title = 'LeetVisual canvas';
  Object.assign(frame.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px',
    border: '0',
    margin: '0',
    padding: '0',
    zIndex: '30',
    display: 'none',
    colorScheme: 'normal',
  });
  frame.src = src;
  doc.body.append(frame);
  return frame;
}

export function positionFrame(frame: HTMLIFrameElement, box: Box): void {
  Object.assign(frame.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
}

export function floatBox(view: { innerWidth: number; innerHeight: number }): Box {
  const width = Math.min(560, view.innerWidth * 0.9);
  const height = Math.min(420, view.innerHeight * 0.6);
  return { left: view.innerWidth - width - 16, top: view.innerHeight - height - 16, width, height };
}

export function showFrame(frame: HTMLIFrameElement, on: boolean): void {
  frame.style.display = on ? 'block' : 'none';
  if (on) frame.focus();
}
