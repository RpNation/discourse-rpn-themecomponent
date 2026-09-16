import { module, test } from "qunit";
import {
  normalizePostMarkerRules,
  postMarkerColor,
  postMarkerStyles,
} from "../../discourse/lib/rpn-post-marker-colors";

const siteGroups = [
  { id: 1, name: "admins" },
  { id: 2, name: "moderators" },
  { id: 3, name: "staff" },
  { id: 42, name: "Writers" },
  { id: 43, name: "Artists" },
];

function rules(definitions) {
  return normalizePostMarkerRules(definitions);
}

module("Unit | RpNation post marker colors", function () {
  test("accepts hex colors and native group IDs while preserving rule order", function (assert) {
    assert.deepEqual(
      rules([
        { name: "Arbitrary label", group_ids: ["42", 42, 43], color: " #A1B " },
        { group_ids: [1], color: "FF0000" },
        { group_ids: [2], color: "#9735CA" },
      ]),
      [
        { groupIds: [42, 43], color: "a1b" },
        { groupIds: [1], color: "ff0000" },
        { groupIds: [2], color: "9735ca" },
      ]
    );
  });

  test("rejects malformed settings and colors before they can enter CSS", function (assert) {
    for (const definitions of [undefined, null, "[]", {}]) {
      assert.deepEqual(rules(definitions), []);
    }
    assert.deepEqual(
      rules([
        null,
        {},
        { group_ids: "42", color: "abc" },
        { group_ids: [], color: "abc" },
        ...[
          "",
          "red",
          "#abcd",
          "#12345678",
          "var(--danger)",
          "fff;}body{display:none",
          "</style><script>alert(1)</script>",
          123,
        ].map((color) => ({ group_ids: [42], color })),
      ]),
      []
    );
    assert.strictEqual(postMarkerStyles([]), "");
    assert.strictEqual(
      postMarkerStyles([
        { color: "ABC" },
        { color: "#abc" },
        { color: "ff0000" },
        { color: "fff;}body{display:none" },
      ]),
      ".rpn-post-marker--abc{--rpn-post-marker-color:#abc;}\n.rpn-post-marker--ff0000{--rpn-post-marker-color:#ff0000;}",
      "the stylesheet only contains unique validated colors"
    );
  });

  test("ignores unavailable automatic groups and invalid IDs without dropping valid selections", function (assert) {
    assert.deepEqual(
      rules([
        {
          group_ids: [
            0,
            4,
            5,
            10,
            11,
            12,
            13,
            14,
            -1,
            1.5,
            Number.MAX_SAFE_INTEGER + 1,
            "42x",
            "01",
            true,
            null,
            {},
            1,
            2,
            3,
            42,
          ],
          color: "abc",
        },
      ]),
      [{ groupIds: [1, 2, 3, 42], color: "abc" }]
    );
  });

  test("configured order resolves overlapping administrator, moderator, staff, and primary group rules", function (assert) {
    const admin = {
      admin: true,
      moderator: true,
      primary_group_name: "Writers",
    };
    const definitions = [
      { group_ids: [1], color: "ff0000" },
      { group_ids: [2], color: "9735ca" },
      { group_ids: [42], color: "00ff00" },
    ];
    assert.strictEqual(
      postMarkerColor(admin, rules(definitions), siteGroups),
      "ff0000"
    );
    assert.strictEqual(
      postMarkerColor(admin, rules([...definitions].reverse()), siteGroups),
      "00ff00",
      "a custom primary group can take priority when placed first"
    );
    assert.strictEqual(
      postMarkerColor(
        admin,
        rules([definitions[1], definitions[0]]),
        siteGroups
      ),
      "9735ca",
      "administrator precedence is configurable"
    );
    const staffRule = rules([{ group_ids: [3], color: "abc" }]);
    for (const post of [
      { admin: true },
      { moderator: true },
      { staff: true },
    ]) {
      assert.strictEqual(postMarkerColor(post, staffRule, []), "abc");
    }
    assert.strictEqual(postMarkerColor({}, staffRule, siteGroups), null);
  });

  test("matches a custom group's current name case-insensitively using its saved ID", function (assert) {
    const definitions = rules([{ group_ids: [42, 43], color: "abc" }]);
    assert.strictEqual(
      postMarkerColor(
        { primary_group_name: "wRiTeRs" },
        definitions,
        siteGroups
      ),
      "abc"
    );
    assert.strictEqual(
      postMarkerColor(
        { primary_group_name: "Artists" },
        definitions,
        siteGroups
      ),
      "abc"
    );
    assert.strictEqual(
      postMarkerColor({ primary_group_name: "Novelists" }, definitions, [
        { id: 42, name: "Novelists" },
      ]),
      "abc",
      "renaming a group does not invalidate its configured ID"
    );
    assert.strictEqual(
      postMarkerColor({ primary_group_name: "Writers" }, definitions, []),
      null
    );
    assert.strictEqual(
      postMarkerColor({ primary_group_name: "Other" }, definitions, siteGroups),
      null
    );
    assert.strictEqual(postMarkerColor({}, definitions, siteGroups), null);
    assert.strictEqual(postMarkerColor(null, definitions, siteGroups), null);
  });

  test("does not infer secondary memberships or privileged roles from a primary group name", function (assert) {
    const definitions = rules([
      { group_ids: [1, 2], color: "ff0000" },
      { group_ids: [42], color: "abc" },
    ]);
    for (const post of [
      { groups: [42], group_ids: [42], primary_group_name: "Artists" },
      { primary_group_name: "admins", admin: false },
      { primary_group_name: "moderators", moderator: false },
      { admin: "true", moderator: 1 },
    ]) {
      assert.strictEqual(postMarkerColor(post, definitions, siteGroups), null);
    }
  });

  test("leaves native post, topic, author, and group records untouched", function (assert) {
    const topic = Object.freeze({ id: 280 });
    const author = Object.freeze({ id: 91, username: "writer" });
    const post = Object.freeze({
      topic,
      user: author,
      primary_group_name: "Writers",
    });
    const groups = Object.freeze(
      siteGroups.map((group) => Object.freeze({ ...group }))
    );
    const definitions = Object.freeze([
      Object.freeze({ group_ids: Object.freeze([42]), color: "#ABC" }),
    ]);
    const normalized = rules(definitions);
    assert.strictEqual(postMarkerColor(post, normalized, groups), "abc");
    assert.strictEqual(post.topic, topic);
    assert.strictEqual(post.user, author);
    assert.strictEqual(post.primary_group_name, "Writers");
    assert.strictEqual(definitions[0].color, "#ABC");
    assert.strictEqual(
      postMarkerColor(post, [], groups),
      null,
      "empty settings use the ordinary marker fallback"
    );
  });
});
