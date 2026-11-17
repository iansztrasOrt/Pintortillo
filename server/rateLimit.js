// Límite de tasa por socket (token bucket).

export class TokenBucket {
  constructor({ capacity, refillPerSec, now = Date.now }) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.now = now;
    this.last = now();
  }

  take(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
    this.last = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export function createLimiters() {
  return {
    actions: new TokenBucket({ capacity: 15, refillPerSec: 5 }),
    chat: new TokenBucket({ capacity: 6, refillPerSec: 1.2 }),
    draw: new TokenBucket({ capacity: 80, refillPerSec: 40 }),
  };
}
