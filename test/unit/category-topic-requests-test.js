import { module, test } from "qunit";
import sinon from "sinon";
import { CategoryTopicRequests } from "../../discourse/lib/rpn-category-topic-requests";

function capture(promise) {
  return promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
}

function rateLimit(retryAfter) {
  return {
    jqXHR: {
      status: 429,
      responseText: "<html>Too Many Requests</html>",
      getResponseHeader: () => retryAfter,
    },
  };
}

module("Unit | RpNation category topic requests", function (hooks) {
  hooks.beforeEach(function () {
    this.clock = sinon.useFakeTimers({
      now: Date.UTC(2026, 0, 1),
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
    this.starts = [];
    this.pending = [];
    this.scheduler = new CategoryTopicRequests({
      trackPromise: (promise) => promise,
      request: (url, options) => {
        this.starts.push({ at: Date.now(), url, options });
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        promise.abort = sinon.spy();
        this.pending.push({ resolve, reject, promise });
        return promise;
      },
    });
  });

  hooks.afterEach(function () {
    this.clock.restore();
  });

  test("serializes requests and spaces starts by at least one second", async function (assert) {
    const first = this.scheduler.request("first");
    const second = this.scheduler.request("second");
    await this.clock.tickAsync(0);
    assert.strictEqual(this.starts.length, 1);
    assert.deepEqual(this.starts[0].options, {
      ignoreUnsent: false,
      timeout: 15000,
      data: { q: "first" },
    });
    this.pending[0].resolve({ topic_list: { topics: [] } });
    await first;
    await this.clock.tickAsync(999);
    assert.strictEqual(this.starts.length, 1);
    await this.clock.tickAsync(1);
    assert.strictEqual(this.starts.length, 2);
    assert.strictEqual(this.starts[1].at - this.starts[0].at, 1000);
    this.pending[1].resolve("second result");
    assert.strictEqual(await second, "second result");
  });

  test("a slow request prevents overlap without adding unnecessary delay", async function (assert) {
    const first = this.scheduler.request("first");
    const second = this.scheduler.request("second");
    await this.clock.tickAsync(2500);
    assert.strictEqual(this.starts.length, 1);
    this.pending[0].resolve("one");
    await first;
    await this.clock.tickAsync(0);
    assert.strictEqual(this.starts.length, 2);
    this.pending[1].resolve("two");
    await second;
  });

  test("429 rejects queued work and immediate retries without new requests", async function (assert) {
    const first = capture(this.scheduler.request("first"));
    const queued = capture(this.scheduler.request("queued"));
    await this.clock.tickAsync(0);
    const error = rateLimit("3");
    this.pending[0].reject(error);
    assert.strictEqual((await first).error, error);
    assert.strictEqual((await queued).error.jqXHR.status, 429);
    assert.strictEqual(
      (await capture(this.scheduler.request("retry"))).error.jqXHR.status,
      429
    );
    assert.strictEqual(this.starts.length, 1);
    assert.strictEqual(this.clock.countTimers(), 0, "cooldown has no timer");
    await this.clock.tickAsync(3000);
    const resumed = this.scheduler.request("after cooldown");
    await this.clock.tickAsync(0);
    assert.strictEqual(this.starts.length, 2);
    this.pending[1].resolve("resumed");
    assert.strictEqual(await resumed, "resumed");
  });

  for (const [name, header, expected] of [
    ["HTTP date", "Thu, 01 Jan 2026 00:00:05 GMT", 5000],
    ["missing header", null, 60000],
    ["invalid header", "later", 60000],
    ["empty header", "", 60000],
    ["zero seconds", "0", 1000],
    ["negative seconds", "-3", 1000],
    ["past date", "Wed, 31 Dec 2025 23:59:50 GMT", 1000],
  ]) {
    test(`429 handles ${name}`, async function (assert) {
      const started = Date.now();
      const result = capture(this.scheduler.request("category"));
      await this.clock.tickAsync(0);
      this.pending[0].reject(rateLimit(header));
      await result;
      assert.strictEqual(this.scheduler.blockedUntil, started + expected);
    });
  }

  test("an already aborted signal makes no request", async function (assert) {
    const controller = new AbortController();
    controller.abort();
    const result = await capture(
      this.scheduler.request("category", { signal: controller.signal })
    );
    assert.strictEqual(result.error.name, "AbortError");
    assert.strictEqual(this.starts.length, 0);
  });

  test("aborting queued work rejects immediately and never sends it", async function (assert) {
    const first = this.scheduler.request("first");
    const controller = new AbortController();
    const queued = capture(
      this.scheduler.request("queued", { signal: controller.signal })
    );
    await this.clock.tickAsync(0);
    controller.abort();
    assert.strictEqual((await queued).error.name, "AbortError");
    this.pending[0].resolve("one");
    await first;
    await this.clock.tickAsync(2000);
    assert.strictEqual(this.starts.length, 1);
  });

  test("aborting during pacing cancels the timer and leaves the queue usable", async function (assert) {
    const first = this.scheduler.request("first");
    await this.clock.tickAsync(0);
    this.pending[0].resolve("one");
    await first;
    const controller = new AbortController();
    const paced = capture(
      this.scheduler.request("paced", { signal: controller.signal })
    );
    await this.clock.tickAsync(100);
    controller.abort();
    assert.strictEqual((await paced).error.name, "AbortError");
    assert.strictEqual(this.clock.countTimers(), 0);
    const next = this.scheduler.request("next");
    await this.clock.tickAsync(900);
    assert.strictEqual(this.starts.length, 2);
    assert.strictEqual(this.starts[1].options.data.q, "next");
    this.pending[1].resolve("next result");
    await next;
  });

  test("aborting in flight cancels native ajax and releases the queue", async function (assert) {
    const controller = new AbortController();
    const first = capture(
      this.scheduler.request("first", { signal: controller.signal })
    );
    await this.clock.tickAsync(0);
    controller.abort();
    assert.strictEqual((await first).error.name, "AbortError");
    assert.true(this.pending[0].promise.abort.calledOnce);
    const next = this.scheduler.request("next");
    await this.clock.tickAsync(1000);
    assert.strictEqual(this.starts.length, 2);
    this.pending[1].resolve("next result");
    await next;
  });

  test("non-rate-limit failures do not block the next request", async function (assert) {
    const first = capture(this.scheduler.request("first"));
    const second = this.scheduler.request("second");
    await this.clock.tickAsync(0);
    this.pending[0].reject({ jqXHR: { status: 500 } });
    await first;
    await this.clock.tickAsync(1000);
    assert.strictEqual(this.scheduler.blockedUntil, 0);
    assert.strictEqual(this.starts.length, 2);
    this.pending[1].resolve("two");
    await second;
  });
});
