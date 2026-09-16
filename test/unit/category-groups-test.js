import { module, test } from "qunit";
import { buildCategoryGroups } from "../../discourse/lib/rpn-category-groups";

function category(id, overrides = {}) {
  return { id, name: `Project ${id}`, topic_count: 5, ...overrides };
}

function definition(categoryIds, overrides = {}) {
  return { name: "Hosted Projects", category_ids: categoryIds, ...overrides };
}

function topic(id, overrides = {}) {
  return {
    id,
    bumped_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

module("Unit | RpNation visual category groups", function () {
  test("places a group at its first member and preserves native member order and hierarchy", function (assert) {
    const before = category(1);
    const first = category(2, { subcategory_ids: [20], has_children: true });
    const between = category(3);
    const second = category(4, { subcategory_ids: [40], has_children: true });
    const after = category(5);
    const entries = buildCategoryGroups(
      [before, first, between, second, after],
      [definition([4, "2"])]
    );

    assert.strictEqual(entries.length, 4);
    assert.strictEqual(entries[0].category, before);
    assert.strictEqual(entries[1].group.anchor, first);
    assert.deepEqual(entries[1].group.members, [first, second]);
    assert.strictEqual(entries[2].category, between);
    assert.strictEqual(entries[3].category, after);
    assert.deepEqual(first.subcategory_ids, [20]);
    assert.deepEqual(second.subcategory_ids, [40]);
    assert.strictEqual(first.parent_category_id, undefined);
  });

  test("sums native totals once without counting descendants twice", function (assert) {
    const first = category(1, {
      topic_count: 5,
      topics_all_time: 20,
      subcategory_ids: [11],
      subcategories: [category(11, { parent_category_id: 1, topic_count: 15 })],
    });
    const second = category(2, { topic_count: 3, topics_all_time: 10 });
    const [{ group }] = buildCategoryGroups(
      [first, second],
      [definition([1, 1, "1", 2, 11])]
    );

    assert.strictEqual(group.topicCount, 30);
    assert.strictEqual(group.members.length, 2);
  });

  test("uses a configured hex color without changing real category colors", function (assert) {
    const first = Object.freeze(category(1, { color: "0088CC" }));
    for (const color of ["AABBCC", "#aabbcc", "#abc", "DEF"]) {
      const [{ group }] = buildCategoryGroups(
        [first],
        [definition([1], { color })]
      );
      assert.strictEqual(group.color, color.replace(/^#/, ""));
      assert.strictEqual(first.color, "0088CC");
    }
  });

  test("blank or invalid group colors fall back to the first member", function (assert) {
    for (const color of [
      undefined,
      null,
      "",
      "  ",
      "red",
      "12",
      "12345678",
      "#12345G",
      "000; background: red",
      { color: "ffffff" },
    ]) {
      const [{ group }] = buildCategoryGroups(
        [category(1, { color: "0088CC" })],
        [definition([1], { color })]
      );
      assert.strictEqual(group.color, "0088CC");
    }
  });

  test("uses finite nonnegative counts and falls back when a native total is unavailable", function (assert) {
    const source = [
      category(1, { topics_all_time: 0, topic_count: 99 }),
      category(2, { topic_count: 7 }),
      category(3, { topics_all_time: -1, topic_count: 2 }),
      category(4, { topics_all_time: NaN, topic_count: 3 }),
      category(5, { topics_all_time: Infinity, topic_count: -3 }),
      category(6, { topics_all_time: "20", topic_count: 4 }),
      category(7, { topic_count: undefined }),
    ];
    const [{ group }] = buildCategoryGroups(source, [
      definition(source.map(({ id }) => id)),
    ]);

    assert.strictEqual(group.topicCount, 16);
  });

  test("keeps hidden, muted, and child rows native and ignores unavailable categories", function (assert) {
    const visible = category(1);
    const hidden = category(2, { isHidden: true });
    const muted = category(3, { hasMuted: true });
    const partiallyMuted = category(4, { isHidden: false, hasMuted: true });
    const child = category(5, { parent_category_id: 1 });
    const entries = buildCategoryGroups(
      [visible, hidden, muted, partiallyMuted, child],
      [definition([1, 2, 3, 4, 5, 999])]
    );

    assert.deepEqual(entries[0].group.members, [visible]);
    assert.deepEqual(
      entries.slice(1).map((entry) => entry.category),
      [hidden, muted, partiallyMuted, child]
    );
    assert.deepEqual(
      buildCategoryGroups([hidden, muted], [definition([2, 3, 999])]),
      [{ category: hidden }, { category: muted }],
      "a fully unavailable group is not rendered"
    );
  });

  test("first available definition claims duplicate members and names", function (assert) {
    const source = [category(1), category(2), category(3), category(4)];
    const entries = buildCategoryGroups(source, [
      definition([2, 1]),
      definition([3], { name: " Hosted Projects " }),
      definition([2, 3], { name: "Other Projects" }),
    ]);

    assert.strictEqual(entries.length, 3);
    assert.deepEqual(entries[0].group.members, source.slice(0, 2));
    assert.deepEqual(entries[1].group.members, [source[2]]);
    assert.strictEqual(entries[1].group.name, "Other Projects");
    assert.strictEqual(entries[2].category, source[3]);
  });

  test("ignores malformed definitions and lets unavailable groups leave membership unclaimed", function (assert) {
    const first = category(1);
    const second = category(2);
    const source = [first, second];
    const entries = buildCategoryGroups(source, [
      null,
      false,
      definition([1], { name: "  " }),
      definition("1|2"),
      definition([999]),
      definition([null, false, 0, -1, 1.5, "1e0", "1px", {}, [], "2"]),
    ]);

    assert.strictEqual(entries[0].category, first);
    assert.deepEqual(entries[1].group.members, [second]);
    assert.deepEqual(buildCategoryGroups(source, null), [
      { category: first },
      { category: second },
    ]);
    assert.deepEqual(buildCategoryGroups(null, [definition([1])]), []);
  });

  test("retains native Topic and poster identities without mutating frozen source records", function (assert) {
    const poster = Object.freeze({
      username: "native_user",
      avatar_template: "/native.png",
    });
    const selected = Object.freeze(topic(20, { last_poster: poster }));
    const first = Object.freeze(
      category(1, {
        topic_id: 100,
        topics: Object.freeze([
          Object.freeze(topic(100, { bumped_at: "2026-10-01T12:00:00Z" })),
          selected,
        ]),
      })
    );
    const second = Object.freeze(
      category(2, {
        topics: Object.freeze([
          Object.freeze(
            topic(30, { visible: false, bumped_at: "2026-10-01T12:00:00Z" })
          ),
          Object.freeze(topic(10, { pinned: true })),
        ]),
      })
    );
    const source = Object.freeze([first, second]);
    const definitions = Object.freeze([
      Object.freeze(definition(Object.freeze([1, 2]))),
    ]);
    const [{ group }] = buildCategoryGroups(source, definitions);

    assert.strictEqual(group.members[0], first);
    assert.strictEqual(group.members[1], second);
    assert.strictEqual(
      group.topic,
      selected,
      "equal activity uses the higher topic ID"
    );
    assert.strictEqual(group.topic.last_poster, poster);
    assert.strictEqual(first.topics[1], selected);
    assert.strictEqual(source.length, 2);
    assert.strictEqual(first.topics.length, 2);
  });

  test("recomputes directly from newly supplied rows and topics without retained previews", function (assert) {
    const original = topic(1);
    const replacement = topic(2, { bumped_at: "2025-01-01T12:00:00Z" });
    const first = category(1, { topics: [original] });
    const source = [first];
    const definitions = [definition([1, 2])];
    const initial = buildCategoryGroups(source, definitions)[0].group;
    assert.strictEqual(initial.topic, original);

    first.topics = [replacement];
    source.push(category(2));
    const next = buildCategoryGroups(source, definitions)[0].group;
    assert.strictEqual(next.topic, replacement);
    assert.strictEqual(next.members.length, 2);
    assert.strictEqual(next.key, initial.key);
    assert.strictEqual(
      initial.topic,
      replacement,
      "an existing group reads the current native topics without retaining a preview"
    );

    first.topics = [];
    assert.strictEqual(initial.topic, null);
    assert.strictEqual(
      buildCategoryGroups(source, definitions)[0].group.topic,
      null
    );
  });

  test("keeps configured labels and descriptions as plain strings", function (assert) {
    const name = "<img src=x onerror=alert(1)>";
    const description = "<strong>Project description</strong>";
    const [{ group }] = buildCategoryGroups(
      [category(1)],
      [
        definition([1], {
          name: ` ${name} `,
          description: ` ${description} `,
          icon: " globe ",
        }),
      ]
    );

    assert.strictEqual(group.name, name);
    assert.strictEqual(group.description, description);
    assert.strictEqual(group.icon, "globe");
    assert.strictEqual(typeof group.name, "string");
    assert.strictEqual(typeof group.description, "string");
  });
});
