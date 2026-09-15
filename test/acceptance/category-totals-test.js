import { visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";
import { i18n } from "discourse-i18n";

for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Category totals | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.settings({
        desktop_category_page_style: "categories_with_featured_topics",
        mobile_category_page_style: "categories_with_featured_topics",
      });
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => {
          const data = cloneJSON(discoveryFixtures["/categories.json"]);
          for (const category of data.category_list.categories) {
            category.topics_week = 7;
            category.topics_month = 28;
            category.topics_all_time = category.id === 1 ? 999 : 0;
            category.topic_count = category.id === 1 ? 123 : 0;
          }
          return helper.response(data);
        });
        server.get("/filter.json", () =>
          helper.response({ users: [], topic_list: { topics: [] } })
        );
      });

      test("shows all-time totals including subcategories instead of activity rates", async function (assert) {
        await visit("/categories");
        const row = mobile ? ".category-list-item" : "tr";
        const first = `${row}[data-category-id="1"]`;
        assert
          .dom(`${first} .rpn-category-total .value`)
          .hasText(
            mobile ? i18n("categories.topic_sentence", { count: 999 }) : "999"
          );
        assert.dom(`${first} .rpn-category-total .unit`).doesNotExist();
        assert.dom(`${first} .rpn-category-total .category__badges`).exists();
        assert
          .dom(`${row}[data-category-id="2"] .rpn-category-total .value`)
          .hasText(
            mobile ? i18n("categories.topic_sentence", { count: 0 }) : "0"
          );
        if (mobile) {
          // Theme CSS hides the native footer; the JS harness omits theme styles.
          assert.dom(`${first} > .category-topics-count`).exists();
        }
      });
    }
  );
}
