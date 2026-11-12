/**
 * Trackpad pinch arrives as `wheel` events with ctrlKey (Chrome, Firefox, Edge) or as
 * `gesture*` events (Safari). Unless a non-passive listener cancels them, the browser
 * zooms the whole page. This keeps pinch inside the app: browser zoom is cancelled
 * everywhere the editor is open, and pinches over the board zoom the board instead.
 */
type Pinch = (factor: number, clientX: number, clientY: number) => void;
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

export function captureBrowserZoom(isOverBoard: (target: EventTarget | null, clientX: number, clientY: number) => boolean, onPinch: Pinch, frames: () => Document[] = () => []) {
 const wheel = (event: WheelEvent) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  if (isOverBoard(event.target, event.clientX, event.clientY)) onPinch(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
 };
 let last = 1;
 const gestureStart = (event: Event) => { event.preventDefault(); last = 1; };
 const gestureChange = (event: Event) => {
  event.preventDefault();
  const gesture = event as GestureEvent;
  if (gesture.scale > 0 && isOverBoard(event.target, gesture.clientX, gesture.clientY)) onPinch(gesture.scale / last, gesture.clientX, gesture.clientY);
  last = gesture.scale;
 };
 const targets: EventTarget[] = [window, ...frames()];
 for (const target of targets) {
  target.addEventListener('wheel', wheel as EventListener, { passive: false, capture: true });
  target.addEventListener('gesturestart', gestureStart, { passive: false });
  target.addEventListener('gesturechange', gestureChange, { passive: false });
  target.addEventListener('gestureend', gestureStart, { passive: false });
 }
 return () => {
  for (const target of targets) {
   target.removeEventListener('wheel', wheel as EventListener, { capture: true });
   target.removeEventListener('gesturestart', gestureStart);
   target.removeEventListener('gesturechange', gestureChange);
   target.removeEventListener('gestureend', gestureStart);
  }
 };
}
