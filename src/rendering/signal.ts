export interface SignalSource {
  /** Normalized samples in [-1, 1]. A future audio adapter can implement this. */
  sample(time: number, index: number, count: number): number;
}

export class ProceduralSignal implements SignalSource {
  sample(time: number, index: number, count: number) {
    const x = index / count;
    const envelope = Math.sin(Math.PI * x) ** 1.4;
    return envelope * (
      Math.sin(x * 70 - time * 1.6) * 0.48 +
      Math.sin(x * 157 + time * 0.8) * 0.24 +
      Math.sin(x * 281 - time * 0.3) * 0.12
    );
  }
}
