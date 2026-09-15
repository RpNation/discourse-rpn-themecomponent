import { module, test } from "qunit";
import {
  nativeCategoryPreview,
  setCategoryPreview,
} from "../../discourse/lib/rpn-category-preview";

function topic(id, overrides = {}) {
  return {
    id,
    category_id: 7,
    bumped_at: "2026-01-01T12:00:00Z",
    pinned: false,
    ...overrides,
  };
}

function category(topics, overrides = {}) {
  return {
    id: 7,
    topic_count: 10,
    topics,
    set(key, value) {
      this[key] = value;
    },
    ...overrides,
  };
}

module("Unit | RpNation native category previews", function () {
  test("preserves unverified parent previews and malformed dates for immediate display", function (assert) {
    const unknown = topic(1, { category_id: undefined });
    const parent = category([unknown], { subcategory_ids: [8] });
    assert.strictEqual(nativeCategoryPreview(parent).topic, unknown);
    assert.false(nativeCategoryPreview(parent).complete);
    const malformed = topic(2, { bumped_at: "invalid" });
    const invalidPreview = nativeCategoryPreview(category([malformed]));
    assert.strictEqual(invalidPreview.topic, malformed);
    assert.false(invalidPreview.complete);
  });

  test("ordinary activity previews establish latest and preserve native poster objects", function (assert) {
    const poster = {
      username: "native_user",
      avatar_template: "/avatar/{size}.png",
    };
    const latest = topic(2, { last_poster: poster });
    const record = category([
      topic(1, { pinned: true, bumped_at: "2025-01-01T12:00:00Z" }),
      latest,
    ]);
    const preview = nativeCategoryPreview(record);
    assert.true(preview.complete);
    assert.strictEqual(preview.topic, latest);
    setCategoryPreview(record, preview.topic);
    assert.strictEqual(record.topics[0].last_poster, poster);
    assert.strictEqual(record.topics.length, 1);
  });

  test("compacted arrays are not fresh evidence on a remount", function (assert) {
    const record = category([topic(1)]);
    assert.true(nativeCategoryPreview(record).complete);
    setCategoryPreview(record, record.topics[0]);
    const previousArray = record.topics;
    assert.false(nativeCategoryPreview(record).complete);
    assert.strictEqual(nativeCategoryPreview(record).topic, previousArray[0]);
    record.topics = [...previousArray];
    assert.true(
      nativeCategoryPreview(record).complete,
      "a fresh native array restores evidence"
    );
    assert.false(
      nativeCategoryPreview(category(previousArray)).complete,
      "the marked array remains marked"
    );
  });

  test("empty known categories are complete but missing counts and previews are not", function (assert) {
    assert.deepEqual(
      nativeCategoryPreview(category([topic(1)], { topic_count: 0 })),
      { topic: null, complete: true }
    );
    assert.false(
      nativeCategoryPreview(category([], { topic_count: undefined })).complete
    );
    assert.false(nativeCategoryPreview(category(undefined)).complete);
  });

  test("all distinct topics can resolve pinned-only and custom-sorted previews", function (assert) {
    const record = category(
      [topic(1, { pinned: true }), topic(2, { pinned: true })],
      { topic_count: 2, sort_order: "title", sort_ascending: true }
    );
    const preview = nativeCategoryPreview(record);
    assert.true(preview.complete);
    assert.strictEqual(preview.topic.id, 2, "equal dates use the higher ID");
    record.topics = [record.topics[0], record.topics[0]];
    assert.false(
      nativeCategoryPreview(record).complete,
      "duplicate IDs cannot satisfy the count"
    );
  });

  test("custom sorts and ascending order require complete counts", function (assert) {
    for (const overrides of [
      { sort_order: "title" },
      { sort_order: "activity", sort_ascending: true },
      { sort_ascending: "true" },
    ]) {
      assert.false(
        nativeCategoryPreview(category([topic(1)], overrides)).complete
      );
    }
  });

  test("dismissed and unspecified pins alone do not prove an ordinary preview", function (assert) {
    for (const overrides of [
      { pinned: false, unpinned: true },
      { pinned: true },
      { pinned: undefined },
    ]) {
      const preview = nativeCategoryPreview(category([topic(1, overrides)]));
      assert.false(preview.complete);
      assert.strictEqual(
        preview.topic.id,
        1,
        "retain the best preview while fetching"
      );
    }
  });

  test("invalid timestamps alongside an ordinary topic prevent an early finish", function (assert) {
    const valid = topic(1);
    for (const bumped_at of [null, undefined, "invalid"]) {
      const preview = nativeCategoryPreview(
        category([valid, topic(2, { bumped_at })])
      );
      assert.false(preview.complete);
      assert.strictEqual(preview.topic, valid);
    }
  });

  test("definition, unlisted, and child topics cannot establish latest", function (assert) {
    const record = category(
      [topic(1), topic(2, { visible: false }), topic(3, { category_id: 8 })],
      { topic_url: "/t/about-category/1" }
    );
    assert.deepEqual(nativeCategoryPreview(record), {
      topic: null,
      complete: false,
    });
  });

  test("missing category IDs are safe only for leaves", function (assert) {
    const preview = topic(1, { category_id: undefined });
    assert.true(nativeCategoryPreview(category([preview])).complete);
    for (const children of [
      { subcategory_ids: [8] },
      { subcategory_list: [{ id: 8 }] },
    ]) {
      const result = nativeCategoryPreview(
        category([preview, topic(2)], children)
      );
      assert.false(
        result.complete,
        "mixed parent and ambiguous IDs require lookup"
      );
      assert.strictEqual(
        result.topic.id,
        2,
        "only the explicitly scoped parent preview survives"
      );
    }
  });
});
