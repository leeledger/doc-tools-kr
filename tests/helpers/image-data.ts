// Minimal ImageData for Node (tests and regress:compress only; never shipped). Browsers and workers
// have the real one; the engine and @jsquash only use `data`, `width` and `height`.
class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb';
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (typeof a === 'number') {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? a.length / 4 / b;
    }
  }
}

globalThis.ImageData ??= NodeImageData as unknown as typeof ImageData;
