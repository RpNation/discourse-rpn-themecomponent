import { click, findAll, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import topFixtures from "discourse/tests/fixtures/top-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const categoryRow = 'tr[data-category-id="1"]';

function stubLayoutTopics(server, helper) {
  server.get("/filter.json", (request) => {
    const slugs = request.queryParams.q
      .match(/=category:([^ ]+)/)?.[1]
      .split(",")
      .map((slug) => slug.split(":").pop());
    const topics = discoveryFixtures[
      "/categories.json"
    ].category_list.categories
      .filter((entry) => slugs.includes(entry.slug))
      .flatMap((category) => {
        const topic = cloneJSON(category.topics?.[0] || null);
        if (!topic) {
          return [];
        }
        topic.category_id = category.id;
        topic.posters = [{ user_id: 9102, extras: "latest" }];
        topic.last_poster_username = "latest_replier";
        return [topic];
      });
    return helper.response({
      users: [
        {
          id: 9102,
          username: "latest_replier",
          avatar_template: "/images/rpn-latest-replier.png",
        },
      ],
      topic_list: { topics },
    });
  });
}

for (const style of [
  "categories_with_featured_topics",
  "subcategories_with_featured_topics",
]) {
  acceptance(`RPN Foundation | Category layout | ${style}`, function (needs) {
    needs.pretender(stubLayoutTopics);
    needs.settings({ desktop_category_page_style: style });

    test("replaces the latest cell once in each category row", async function (assert) {
      await visit("/categories");

      assert
        .dom(`${categoryRow} > td.latest.rpn-category-latest`)
        .exists({ count: 1 });
      assert.dom(`${categoryRow} > td.latest`).exists({ count: 1 });
      assert.dom("td.latest:not(.rpn-category-latest)").doesNotExist();
      assert.dom(".rpn-category-latest .rpn-featured-topic").exists();

      for (const cell of findAll(".rpn-category-latest")) {
        assert.true(
          cell.matches("tr[data-category-id] > td.latest"),
          "the outlet renders a table cell inside a category row"
        );
      }
    });
  });
}

for (const style of [
  "categories_only",
  "categories_and_latest_topics",
  "categories_and_top_topics",
  "categories_boxes",
  "categories_boxes_with_topics",
]) {
  acceptance(`RPN Foundation | Category layout | ${style}`, function (needs) {
    needs.settings({ desktop_category_page_style: style });
    needs.pretender((server, helper) => {
      stubLayoutTopics(server, helper);
      server.get("/categories_and_top", () =>
        helper.response({
          ...cloneJSON(discoveryFixtures["/categories.json"]),
          ...cloneJSON(topFixtures["/top.json"]),
        })
      );
    });

    test("does not add a latest table cell without featured category rows", async function (assert) {
      await visit("/categories");

      assert.dom(".rpn-category-latest").doesNotExist();
      assert.dom("td.latest").doesNotExist();
    });
  });
}

acceptance("RPN Foundation | Category layout | mobile", function (needs) {
  needs.mobileView();
  needs.pretender(stubLayoutTopics);
  needs.settings({
    mobile_category_page_style: "subcategories_with_featured_topics",
  });

  test("keeps mobile featured topics without adding table cells", async function (assert) {
    await visit("/categories");

    assert
      .dom('div.category-list.with-topics a[data-topic-id="11994"]')
      .exists();
    assert.dom(".rpn-category-latest").doesNotExist();
    assert.dom("td.latest").doesNotExist();
  });
});

for (const mutedParent of [true, false]) {
  acceptance(
    `RPN Foundation | Category muting | ${mutedParent ? "parent" : "child"}`,
    function (needs) {
      needs.settings({
        desktop_category_page_style: "categories_with_featured_topics",
      });
      needs.pretender((server, helper) => {
        stubLayoutTopics(server, helper);
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const parent = response.category_list.categories.find(
            (category) => category.id === 2
          );
          const child = cloneJSON(parent.subcategory_list[0]);
          parent.notification_level = mutedParent ? 0 : 1;
          child.notification_level = mutedParent ? 1 : 0;
          parent.subcategory_list = [child];
          response.category_list.categories.push(child);
          return helper.response(response);
        });
      });

      test("preserves core topic visibility in normal and expanded muted lists", async function (assert) {
        const normalRow =
          'tbody[aria-labelledby="categories-only-category"] > tr[data-category-id="2"]';
        const mutedRow =
          'tbody[aria-labelledby="categories-only-category-muted"] > tr[data-category-id="2"]';

        await visit("/categories");

        assert.dom(normalRow).exists();
        assert.dom(`${normalRow} .rpn-category-latest`).doesNotExist();
        assert.dom(`${mutedRow} .rpn-category-latest`).doesNotExist();
        if (mutedParent) {
          assert.dom(`${normalRow} > td.latest`).doesNotExist();
        } else {
          assert.dom(`${normalRow} > td.latest`).exists({ count: 1 });
        }

        await click(".muted-categories-link");

        assert.dom(".muted-categories table.category-list").isVisible();
        assert.dom(mutedRow).exists();
        if (mutedParent) {
          assert.dom(`${mutedRow} > td.latest`).exists({ count: 1 });
          assert.dom(`${mutedRow} .featured-topic`).exists();
        } else {
          assert.dom(`${mutedRow} > td.latest`).doesNotExist();
        }
        assert.dom(`${categoryRow} .rpn-category-latest`).exists({ count: 1 });
      });
    }
  );
}
for (const mutedParent of [true, false]) {
  acceptance(
    `RPN Foundation | Mobile category avatars | muted ${mutedParent ? "parent" : "child"}`,
    function (needs) {
      needs.mobileView();
      needs.settings({
        mobile_category_page_style: "categories_with_featured_topics",
      });
      needs.pretender((server, helper) => {
        stubLayoutTopics(server, helper);
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const parent = response.category_list.categories.find(
            (category) => category.id === 2
          );
          const child = cloneJSON(parent.subcategory_list[0]);
          parent.notification_level = mutedParent ? 0 : 1;
          child.notification_level = mutedParent ? 1 : 0;
          parent.subcategory_list = [child];
          parent.topics[0].last_poster = {
            id: 9102,
            username: "latest_replier",
            avatar_template: "/images/rpn-latest-replier.png",
          };
          response.category_list.categories.push(child);
          return helper.response(response);
        });
      });

      test("follows native topic visibility while toggling the muted list", async function (assert) {
        await visit("/categories");

        const normalCategory =
          'div.category-list-item[data-category-id="2"]:not(.muted-categories *)';
        const mutedCategory =
          '.muted-categories div.category-list .category-list-item[data-category-id="2"]';
        const avatar =
          '.rpn-mobile-category-topic__poster [data-user-card="latest_replier"]';

        assert.dom(normalCategory).exists();
        assert.dom(".muted-categories div.category-list").hasClass("hidden");
        if (mutedParent) {
          assert.dom(`${normalCategory} tr.category-topic-link`).doesNotExist();
          assert.dom(`${normalCategory} ${avatar}`).doesNotExist();
        } else {
          assert.dom(`${normalCategory} tr.category-topic-link`).exists();
          assert.dom(`${normalCategory} ${avatar}`).exists({ count: 1 });
        }

        await click(".muted-categories-link");

        assert
          .dom(".muted-categories div.category-list")
          .doesNotHaveClass("hidden");
        if (mutedParent) {
          assert.dom(`${mutedCategory} tr.category-topic-link`).exists();
          assert.dom(`${mutedCategory} ${avatar}`).exists({ count: 1 });
        } else {
          assert.dom(`${mutedCategory} tr.category-topic-link`).doesNotExist();
          assert.dom(`${mutedCategory} ${avatar}`).doesNotExist();
        }

        await click(".muted-categories-link");
        assert.dom(".muted-categories div.category-list").hasClass("hidden");

        await click(".muted-categories-link");
        if (mutedParent) {
          assert.dom(`${mutedCategory} ${avatar}`).exists({ count: 1 });
        } else {
          assert.dom(`${normalCategory} ${avatar}`).exists({ count: 1 });
        }
      });
    }
  );
}
