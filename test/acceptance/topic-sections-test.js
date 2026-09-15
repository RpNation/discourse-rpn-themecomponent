import { getOwner } from "@ember/owner";
import { click, find, findAll, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const topicIds = [99201, 99202, 99203, 99204];
const topicRows = ".topic-list > .topic-list-body > .topic-list-item";
const pinnedHeader = ".rpn-topic-section--pinned";
const normalHeader = ".rpn-topic-section--normal";

// Theme QUnit loads core styles without theme SCSS. These tests cover native
// outlet markup and reactivity; section visibility needs a real-browser check
// with the compiled theme stylesheet.

function assertTopicOrder(assert) {
  assert.deepEqual(
    findAll(topicRows).map((row) => Number(row.dataset.topicId)),
    topicIds,
    "the native topic order and number of rows stay unchanged"
  );
}

function assertColumns(assert, mobile) {
  const table = find(".topic-list");
  const columns = mobile
    ? 1
    : [...table.tHead.rows[0].cells].reduce(
        (total, column) => total + column.colSpan,
        0
      );
  for (const row of findAll(".rpn-topic-section")) {
    assert.strictEqual(
      row.cells[0].colSpan,
      columns,
      "the section spans exactly the native list columns"
    );
  }
  return columns;
}

for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Topic sections | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.user();

      let pins;
      let dismissed;
      needs.hooks.beforeEach(() => {
        pins = [true, true, false, false];
        dismissed = [];
      });
      needs.pretender((server, helper) => {
        ["/latest.json", "/c/bug/1/l/latest.json"].forEach((path) => {
          server.get(path, () => {
            const response = cloneJSON(discoveryFixtures[path]);
            const template = response.topic_list.topics[0];
            response.topic_list.topics = topicIds.map((id, index) => ({
              ...cloneJSON(template),
              id,
              category_id: 1,
              title: `Section topic ${index + 1}`,
              fancy_title: `Section topic ${index + 1}`,
              slug: `section-topic-${index + 1}`,
              pinned: pins[index],
              pinned_globally: false,
              unpinned: false,
              excerpt: null,
            }));
            response.topic_list.more_topics_url = null;
            return helper.response(response);
          });
        });
        server.put("/t/:id/clear-pin", (request) => {
          dismissed.push(Number(request.params.id));
          return helper.response({ success: "OK" });
        });
      });

      test("renders section labels in native table outlets on discovery lists", async function (assert) {
        for (const path of ["/latest", "/c/bug"]) {
          await visit(path);

          assert.dom(`${pinnedHeader} h2`).hasText("Pinned topics");
          assert
            .dom(`.topic-list > .rpn-topic-section-group > ${pinnedHeader}`)
            .exists({ count: 1 });
          assert
            .dom(find(pinnedHeader).parentElement.nextElementSibling)
            .hasClass("topic-list-body");
          const normal = findAll(normalHeader);
          assert.strictEqual(normal.length, 2, "one candidate after each pin");
          for (const row of normal) {
            assert.dom(row.parentElement).hasClass("topic-list-body");
            assert.dom(row).hasTagName("tr");
            assert.dom(row.cells[0]).hasClass("rpn-topic-section__cell");
            assert.dom(row.querySelector("h2")).hasText("Normal topics");
          }
          assert.deepEqual(
            normal.map((row) => row.previousElementSibling.dataset.topicId),
            ["99201", "99202"],
            "candidates attach to pinned rows without inserting topic records"
          );
          assert.strictEqual(
            normal[1].nextElementSibling.dataset.topicId,
            "99203"
          );
          assertTopicOrder(assert);
          assertColumns(assert, mobile);
        }
      });

      test("omits section markup without pins and uses one pinned heading for an all-pinned list", async function (assert) {
        pins = [false, false, false, false];
        await visit("/latest");
        assert.dom(".rpn-topic-section").doesNotExist();
        assertTopicOrder(assert);

        pins = [true, true, true, true];
        await visit("/c/bug");
        assert.dom(pinnedHeader).exists({ count: 1 });
        assert.dom(normalHeader).exists({ count: 4 });
        assertTopicOrder(assert);
      });

      test("does not regroup pins interleaved by native custom sorting", async function (assert) {
        pins = [true, false, true, false];
        await visit("/c/bug");

        const normal = findAll(normalHeader);
        assert.dom(pinnedHeader).exists({ count: 1 });
        assert.deepEqual(
          normal.map((row) => row.previousElementSibling.dataset.topicId),
          ["99201", "99203"],
          "interleaved pins remain in their native positions"
        );
        assertTopicOrder(assert);

        pins = [false, true, false, true];
        await visit("/latest");
        assert.dom(pinnedHeader).doesNotExist();
        assert.deepEqual(
          findAll(normalHeader).map(
            (row) => row.previousElementSibling.dataset.topicId
          ),
          ["99202", "99204"],
          "a regular-first list does not move later pins into a leading group"
        );
        assertTopicOrder(assert);
      });

      test("follows native pin dismissals without replacing topic rows or avatars", async function (assert) {
        await visit("/latest");
        const rows = findAll(topicRows);
        const avatars = findAll(`${topicRows} img.avatar`);
        const store = getOwner(this).lookup("service:store");

        store.createRecord("topic", { id: 99202 }).clearPin();
        await settled();
        assert.dom(pinnedHeader).exists({ count: 1 });
        assert.dom(normalHeader).exists({ count: 1 });
        assert.strictEqual(
          find(normalHeader).nextElementSibling.dataset.topicId,
          "99202",
          "the boundary follows the remaining native pin"
        );

        store.createRecord("topic", { id: 99201 }).clearPin();
        await settled();
        assert.dom(".rpn-topic-section").doesNotExist();
        assert.deepEqual(dismissed, [99202, 99201]);
        assertTopicOrder(assert);
        assert.deepEqual(
          findAll(topicRows),
          rows,
          "topic nodes remain mounted"
        );
        assert.deepEqual(
          findAll(`${topicRows} img.avatar`),
          avatars,
          "avatar nodes remain mounted"
        );
      });

      test("keeps full-width headings aligned when native bulk selection changes columns", async function (assert) {
        await visit("/latest");
        const initialColumns = assertColumns(assert, mobile);

        await click("button.bulk-select");

        const bulkColumns = assertColumns(assert, mobile);
        assert.strictEqual(
          bulkColumns,
          mobile ? 1 : initialColumns + 1,
          "desktop adds the native checkbox column while mobile stays one column"
        );
        assert.dom(`${topicRows} input.bulk-select`).exists({ count: 4 });
        assert.dom(normalHeader).exists({ count: 2 });
        assertTopicOrder(assert);
      });
    }
  );
}
