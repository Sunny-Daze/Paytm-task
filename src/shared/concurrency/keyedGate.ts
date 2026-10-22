export class KeyedGate {
  private readonly running = new Map<string, Promise<void>>();

  busy(keys: string[]): Promise<void> | undefined {
    const pending = keys.flatMap((key) => {
      const running = this.running.get(key);
      return running ? [running] : [];
    });

    return pending.length > 0
      ? Promise.all(pending).then(() => undefined)
      : undefined;
  }

  run<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const result = fn();
    const done = result.then(
      () => undefined,
      () => undefined,
    );

    keys.forEach((key) => this.running.set(key, done));
    void done.then(() =>
      keys.forEach((key) => {
        if (this.running.get(key) === done) {
          this.running.delete(key);
        }
      }),
    );

    return result;
  }
}

export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);

    if (existing) {
      return existing;
    }

    const promise = fn().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);

    return promise;
  }
}
