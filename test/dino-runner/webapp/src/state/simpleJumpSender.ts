// One in-flight jump and one fresh pending jump; no historical replay/retry.
export class SimpleJumpSender {
  private pending: { time: number; resolve: (sent: boolean) => void } | null = null;
  private sending = false;
  private generation = 0;

  constructor(private readonly options: {
    send: () => Promise<unknown>;
    canSend: () => boolean;
    onError: (error: unknown) => void;
    now?: () => number;
  }) {}

  private now(): number { return this.options.now?.() ?? performance.now(); }

  submit(): Promise<boolean> {
    if (!this.options.canSend()) {
      this.clear();
      return Promise.resolve(false);
    }
    this.pending?.resolve(false);
    return new Promise(resolve => {
      this.pending = { time: this.now(), resolve };
      void this.pump();
    });
  }

  clear(): void {
    this.pending?.resolve(false);
    this.pending = null;
    this.generation += 1;
    // An issued bridge write cannot be withdrawn, but its stale result is ignored.
  }

  private async pump(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.pending) {
        const item = this.pending;
        this.pending = null;
        if (!this.options.canSend() || this.now() - item.time >= 250) {
          item.resolve(false);
          continue;
        }
        const generation = this.generation;
        try {
          await this.options.send();
          item.resolve(generation === this.generation);
        } catch (error) {
          item.resolve(false);
          if (generation === this.generation) {
            this.clear();
            this.options.onError(error);
          }
        }
      }
    } finally {
      this.sending = false;
    }
  }
}

