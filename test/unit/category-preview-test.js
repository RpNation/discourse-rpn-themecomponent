import { module, test } from "qunit";
import { nativeCategoryPreview } from "../../discourse/lib/rpn-category-preview";

function topic(id, overrides = {}) {
  return {
    id,
    category_id: 7,
    bumped_at: "2026-01-01T12:00:00Z",
    pinned: false,
    ...overrides,
  };
}

module("Unit | RpNation native category previews", function () {
  test("uses the active plugin's server winner without changing either source array", function (assert) {
    const pinned = Object.freeze(
      topic(1, { pinned: true, bumped_at: "2026-12-01T12:00:00Z" })
    );
    const poster = Object.freeze({ username: "latest_replier" });
    const winner = Object.freeze(topic(2, { last_poster: poster }));
    const topics = Object.freeze([pinned]);
    const latestTopics = Object.freeze([winner]);
    const category = Object.freeze({
      categoryLatestTopicsActive: true,
      latestTopics,
      topics,
      num_featured_topics: 0,
    });

    assert.strictEqual(nativeCategoryPreview(category), winner);
    assert.strictEqual(nativeCategoryPreview(category).last_poster, poster);
    assert.strictEqual(category.topics, topics);
    assert.strictEqual(category.latestTopics, latestTopics);
  });

  test("empty active plugin results never fall back to native pinned previews", function (assert) {
    for (const latestTopics of [[], null, undefined]) {
      assert.strictEqual(
        nativeCategoryPreview({
          categoryLatestTopicsActive: true,
          latestTopics,
          topics: [topic(1, { pinned: true })],
        }),
        null
      );
    }
  });

  test("inactive plugin data leaves the native preview selection unchanged", function (assert) {
    const native = topic(1, { pinned: true });
    const winner = topic(2, { bumped_at: "2026-12-01T12:00:00Z" });
    for (const categoryLatestTopicsActive of [false, undefined]) {
      assert.strictEqual(
        nativeCategoryPreview({
          categoryLatestTopicsActive,
          latestTopics: [winner],
          topics: [native],
        }),
        native
      );
    }
  });

  test("ordinary activity outranks an older pinned preview", function (assert) {
    const pinned = topic(1, {
      pinned: true,
      bumped_at: "2025-01-01T12:00:00Z",
    });
    const ordinary = topic(2);
    assert.strictEqual(
      nativeCategoryPreview({ topics: [pinned, ordinary] }),
      ordinary
    );
  });

  test("a pinned topic remains selected when its activity is newest", function (assert) {
    const pinned = topic(1, {
      pinned: true,
      bumped_at: "2026-02-01T12:00:00Z",
    });
    assert.strictEqual(
      nativeCategoryPreview({ topics: [pinned, topic(2)] }),
      pinned
    );
  });

  test("parent categories retain native descendant previews with no direct topics", function (assert) {
    const descendant = topic(1, { category_id: 8 });
    for (const metadata of [
      { subcategory_ids: [8] },
      { has_children: true },
      { subcategory_count: 2 },
    ]) {
      assert.strictEqual(
        nativeCategoryPreview({
          id: 7,
          topic_count: 0,
          topics: [descendant],
          ...metadata,
        }),
        descendant
      );
    }
    const unspecified = topic(2, { category_id: undefined });
    assert.strictEqual(
      nativeCategoryPreview({
        id: 7,
        topics: [unspecified],
        has_children: true,
      }),
      unspecified
    );
  });

  test("selection preserves the native array, Topic, and poster identities", function (assert) {
    const poster = Object.freeze({
      username: "native_user",
      avatar_template: "/avatar/{size}.png",
    });
    const selected = Object.freeze(topic(2, { last_poster: poster }));
    const first = Object.freeze(topic(1));
    const topics = Object.freeze([first, selected]);
    const category = Object.freeze({ topics });
    assert.strictEqual(nativeCategoryPreview(category), selected);
    assert.strictEqual(category.topics, topics);
    assert.strictEqual(topics[0], first);
    assert.strictEqual(topics.length, 2);
    assert.strictEqual(nativeCategoryPreview(category).last_poster, poster);
  });

  test("valid activity dates take precedence and absent dates retain native order", function (assert) {
    const missing = topic(1, { bumped_at: undefined });
    const invalid = topic(2, { bumped_at: "invalid" });
    const valid = topic(3);
    assert.strictEqual(
      nativeCategoryPreview({ topics: [missing, invalid, valid] }),
      valid
    );
    assert.strictEqual(
      nativeCategoryPreview({ topics: [missing, invalid] }),
      missing
    );
  });

  test("equivalent activity timestamps use the higher topic ID", function (assert) {
    const higher = topic(2, { bumped_at: "2026-01-01T07:00:00-05:00" });
    assert.strictEqual(
      nativeCategoryPreview({ topics: [higher, topic(1)] }),
      higher
    );
  });

  test("category definitions and unlisted topics are excluded", function (assert) {
    const visible = topic(3, { bumped_at: "2025-01-01T12:00:00Z" });
    const topics = [topic(1), topic(2, { visible: false }), visible];
    assert.strictEqual(nativeCategoryPreview({ topic_id: 1, topics }), visible);
    assert.strictEqual(
      nativeCategoryPreview({ topic_url: "/t/about-category/1", topics }),
      visible
    );
  });

  test("empty, missing, and entirely excluded previews return no topic", function (assert) {
    for (const category of [
      {},
      { topics: [] },
      { topic_id: 1, topics: [topic(1), topic(2, { visible: false })] },
    ]) {
      assert.strictEqual(nativeCategoryPreview(category), null);
    }
  });

  test("a fresh native source is selected immediately without retained result state", function (assert) {
    const first = topic(1);
    const next = topic(2, { bumped_at: "2025-01-01T12:00:00Z" });
    const category = { topics: [first] };
    assert.strictEqual(nativeCategoryPreview(category), first);
    category.topics = [next];
    assert.strictEqual(nativeCategoryPreview(category), next);
    category.topics = [];
    assert.strictEqual(nativeCategoryPreview(category), null);
  });
});
