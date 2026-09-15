import { module, test } from "qunit";
import {
  nativeCategoryPreview,
  resolvedCategoryPreview,
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
  test("lazy parent metadata prevents direct counts from proving completeness", function (assert) {
    for (const metadata of [{ has_children: true }, { subcategory_count: 2 }]) {
      const record = category([topic(1, { pinned: true })], {
        ...metadata,
        topic_count: 1,
      });
      assert.false(nativeCategoryPreview(record).complete);
      record.topics = [];
      record.topic_count = 0;
      assert.false(nativeCategoryPreview(record).complete);
      const child = topic(2, { category_id: 8 });
      record.topics = [child];
      assert.true(nativeCategoryPreview(record).complete);
      assert.strictEqual(nativeCategoryPreview(record).topic, child);
    }
  });

  test("preserves unverified parent previews and malformed dates for immediate display", function (assert) {
    const unknown = topic(1, { category_id: undefined });
    const parent = category([unknown], { subcategory_ids: [8] });
    assert.strictEqual(nativeCategoryPreview(parent).topic, unknown);
    assert.true(nativeCategoryPreview(parent).complete);
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
    assert.strictEqual(
      resolvedCategoryPreview(record).topic.last_poster,
      poster
    );
    assert.strictEqual(record.topics.length, 2, "native topics remain intact");
  });

  test("verified projections retain source identity and invalidate on fresh data", function (assert) {
    const original = topic(1, { pinned: true });
    const record = category([original]);
    const source = record.topics;
    const fetched = topic(2);
    assert.true(setCategoryPreview(record, fetched, source));
    assert.strictEqual(record.topics, source);
    assert.strictEqual(record.topics[0], original);
    assert.strictEqual(resolvedCategoryPreview(record).topic, fetched);
    assert.true(resolvedCategoryPreview(record).complete);
    assert.false(
      nativeCategoryPreview(record).complete,
      "native proof is never rewritten"
    );
    const fresh = topic(3);
    record.topics = [fresh];
    assert.strictEqual(resolvedCategoryPreview(record).topic, fresh);
    assert.false(
      setCategoryPreview(record, fetched, source),
      "late response rejected"
    );
    assert.strictEqual(resolvedCategoryPreview(record).topic, fresh);
  });

  test("projection state belongs to its category instance and can resolve empty", function (assert) {
    const source = [topic(1, { pinned: true })];
    const first = category(source);
    const second = category(source);
    setCategoryPreview(first, null, source);
    assert.deepEqual(resolvedCategoryPreview(first), {
      topic: null,
      complete: true,
    });
    assert.strictEqual(resolvedCategoryPreview(second).topic, source[0]);
    assert.false(resolvedCategoryPreview(second).complete);
  });

  test("zero-direct-topic parents retain native descendant previews", function (assert) {
    const child = topic(1, { category_id: 8 });
    const record = category([child], { topic_count: 0, subcategory_ids: [8] });
    assert.strictEqual(nativeCategoryPreview(record).topic, child);
    assert.true(nativeCategoryPreview(record).complete);
    record.topics = [topic(2, { pinned: true })];
    assert.false(nativeCategoryPreview(record).complete);
    record.topic_count = 1;
    assert.false(
      nativeCategoryPreview(record).complete,
      "direct counts never prove parent completeness"
    );
  });

  test("empty known categories are complete but missing counts and previews are not", function (assert) {
    assert.deepEqual(nativeCategoryPreview(category([], { topic_count: 0 })), {
      topic: null,
      complete: true,
    });
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

  test("definitions and unlisted topics are excluded but attached descendants remain", function (assert) {
    const child = topic(3, { category_id: 8 });
    const record = category([topic(1), topic(2, { visible: false }), child], {
      topic_url: "/t/about-category/1",
    });
    assert.strictEqual(nativeCategoryPreview(record).topic, child);
    assert.true(nativeCategoryPreview(record).complete);
  });

  test("parent previews without category IDs use the same native activity evidence", function (assert) {
    const preview = topic(1, { category_id: undefined });
    for (const children of [
      { subcategory_ids: [8] },
      { subcategory_list: [{ id: 8 }] },
    ]) {
      const result = nativeCategoryPreview(category([preview], children));
      assert.true(result.complete);
      assert.strictEqual(result.topic, preview);
    }
  });
});
