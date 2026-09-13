import { click, findAll, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import topFixtures from "discourse/tests/fixtures/top-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const categoryRow = 'tr[data-category-id="1"]';
const featuredTopic = `${categoryRow} .rpn-featured-topic[data-topic-id="11994"]`;
const missingPosterTopic = `${categoryRow} .rpn-featured-topic[data-topic-id="11888"]`;
const lastPostedAt = "2024-06-01T12:00:00Z";

function stubCategories(needs) {
  needs.pretender((server, helper) => {
    server.get("/categories.json", () => {
      const response = cloneJSON(discoveryFixtures["/categories.json"]);
      const category = response.category_list.categories[0];
      const originalPoster = {
        id: 9101,
        username: "original_author",
        avatar_template: "/images/rpn-original-author.png",
      };

      Object.assign(category.topics[0], {
        slug: "rpn-featured-topic",
        title: "A featured topic",
        fancy_title: "A featured topic",
        posts_count: 7,
        highest_post_number: 7,
        last_read_post_number: 3,
        last_posted_at: lastPostedAt,
        bumped_at: "2024-06-02T12:00:00Z",
        posters: [{ user: originalPoster, extras: "original" }],
        last_poster: {
          id: 9102,
          username: "latest_replier",
          avatar_template: "/images/rpn-latest-replier.png",
        },
      });
      Object.assign(category.topics[1], {
        slug: "rpn-missing-poster",
        posts_count: 5,
        highest_post_number: 5,
        last_read_post_number: 1,
        last_posted_at: lastPostedAt,
        posters: [{ user: originalPoster, extras: "original" }],
        last_poster: null,
      });

      return helper.response(response);
    });
  });
}

acceptance("RPN Foundation | Category latest topics", function (needs) {
  needs.settings({
    desktop_category_page_style: "categories_with_featured_topics",
  });
  stubCategories(needs);

  test("shows the last poster's avatar and profile link", async function (assert) {
    await visit("/categories");

    assert
      .dom(`${featuredTopic} .rpn-featured-topic__poster a`)
      .hasAttribute("href", "/u/latest_replier")
      .hasAttribute("data-user-card", "latest_replier");
    assert
      .dom(`${featuredTopic} .rpn-featured-topic__poster img.avatar`)
      .hasAttribute("src", /\/images\/rpn-latest-replier\.png$/);
    assert
      .dom(`${featuredTopic} [data-user-card="original_author"]`)
      .doesNotExist();
    assert
      .dom(`${featuredTopic} img[src$="rpn-original-author.png"]`)
      .doesNotExist();
  });

  test("links the title to the unread post and the date to the last post", async function (assert) {
    await visit("/categories");

    assert
      .dom(`${featuredTopic} a.title`)
      .hasText("A featured topic")
      .hasAttribute("href", "/t/rpn-featured-topic/11994/4");
    assert
      .dom(`${featuredTopic} a.last-posted-at`)
      .hasAttribute("href", "/t/rpn-featured-topic/11994/7");
    assert
      .dom(`${featuredTopic} .last-posted-at .relative-date`)
      .hasAttribute("data-time", String(new Date(lastPostedAt).getTime()));
  });

  test("keeps the avatar column and links when the last poster is missing", async function (assert) {
    await visit("/categories");

    assert.dom(`${missingPosterTopic} .rpn-featured-topic__poster`).exists();
    assert.dom(`${missingPosterTopic} .rpn-featured-topic__poster`).hasText("");
    assert
      .dom(`${missingPosterTopic} .rpn-featured-topic__poster a`)
      .doesNotExist();
    assert.dom(`${missingPosterTopic} img.avatar`).doesNotExist();
    assert
      .dom(`${missingPosterTopic} .rpn-featured-topic__content a.title`)
      .hasAttribute("href", "/t/rpn-missing-poster/11888/2");
    assert
      .dom(`${missingPosterTopic} a.last-posted-at`)
      .hasAttribute("href", "/t/rpn-missing-poster/11888/5");
  });
});

for (const style of [
  "categories_with_featured_topics",
  "subcategories_with_featured_topics",
]) {
  acceptance(`RPN Foundation | Category layout | ${style}`, function (needs) {
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
