export type InputDevice='touch'|'mouse';
export interface PointerIntent {pointerType:string;sourceCapabilities?:{firesTouchEvents?:boolean}|null}
/** Device hints follow actual intent, never viewport size. Inject monotonic time for tests. */
export class InputDeviceTracker {
 device:InputDevice='mouse';
 private lastTouch=-Infinity;
 pointer(event:PointerIntent,now:number):InputDevice {
  if(event.pointerType==='touch'||event.pointerType==='pen'){
   this.lastTouch=now;this.device='touch';
  }else if(event.pointerType==='mouse'&&!event.sourceCapabilities?.firesTouchEvents&&now-this.lastTouch>=800){
   this.device='mouse';
  }
  return this.device;
 }
 key(key:string,editing=false):InputDevice {
  if(!editing&&!['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock'].includes(key))this.device='mouse';
  return this.device;
 }
}
