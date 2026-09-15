import { waitForPromise } from "@ember/test-waiters";
import { ajax } from "discourse/lib/ajax";

function abortedError() {
  const error = new Error("Category topic request aborted");
  error.name = "AbortError";
  return error;
}

function blockedError() {
  return { jqXHR: { status: 429 }, textStatus: "error" };
}

// Share timing only. Topic responses never survive their requesting component.
export class CategoryTopicRequests {
  blockedUntil = 0;
  lastStartedAt = -Infinity;
  tail = Promise.resolve();

  constructor({
    request = ajax,
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    trackPromise = waitForPromise,
  } = {}) {
    this.ajax = request;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.trackPromise = trackPromise;
  }

  request(query, { signal, path = "/filter.json" } = {}) {
    if (signal?.aborted) {
      return Promise.reject(abortedError());
    }
    if (this.blockedUntil > this.now()) {
      return Promise.reject(blockedError());
    }

    let timer;
    let inFlight;
    let rejectAbort;
    const aborted = new Promise((resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      if (timer !== undefined) {
        this.clearTimer(timer);
      }
      rejectAbort(abortedError());
      inFlight?.abort?.();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const execute = async () => {
      if (signal?.aborted) {
        throw abortedError();
      }
      if (this.blockedUntil > this.now()) {
        throw blockedError();
      }
      const delay = Math.max(0, this.lastStartedAt + 1000 - this.now());
      if (delay) {
        await Promise.race([
          new Promise((resolve) => {
            timer = this.setTimer(resolve, delay);
          }),
          aborted,
        ]);
        timer = undefined;
      }
      if (signal?.aborted) {
        throw abortedError();
      }
      if (this.blockedUntil > this.now()) {
        throw blockedError();
      }

      this.lastStartedAt = this.now();
      try {
        inFlight = this.ajax(path, {
          ignoreUnsent: false,
          timeout: 15000,
          data: typeof query === "string" ? { q: query } : query,
        });
        return await Promise.race([inFlight, aborted]);
      } catch (error) {
        if (error?.jqXHR?.status === 429) {
          const value = error.jqXHR.getResponseHeader?.("Retry-After")?.trim();
          let delayMs = 60000;
          if (value) {
            const seconds = Number(value);
            const date = Date.parse(value);
            if (Number.isFinite(seconds)) {
              delayMs = seconds * 1000;
            } else if (Number.isFinite(date)) {
              delayMs = date - this.now();
            }
          }
          this.blockedUntil = Math.max(
            this.blockedUntil,
            this.now() + Math.max(1000, delayMs)
          );
        }
        throw error;
      }
    };

    const queued = this.tail.then(execute);
    this.tail = queued.catch(() => {});
    return this.trackPromise(
      Promise.race([queued, aborted]).finally(() => {
        signal?.removeEventListener("abort", onAbort);
      })
    );
  }
}

export const categoryTopicRequests = new CategoryTopicRequests();
