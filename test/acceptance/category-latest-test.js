import { click, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const latest = {
  id: 11994,
  title: "Newest conversation",
  fancy_title: "Newest conversation",
  slug: "newest-conversation",
  category_id: 1,
  bumped_at: "2026-06-02T12:00:00Z",
  last_posted_at: "2026-06-02T12:00:00Z",
  posts_count: 7,
  highest_post_number: 7,
  last_read_post_number: 3,
  last_poster_username: "latest_replier",
  posters: [{ user_id: 9102, extras: "latest" }],
  pinned: false,
  pinned_globally: false,
};
const user = {
  id: 9102,
  username: "latest_replier",
  avatar_template: "/images/rpn-latest-replier.png",
};
const oldPin = {
  ...latest,
  id: 11888,
  title: "Old global announcement",
  fancy_title: "Old global announcement",
  bumped_at: "2025-01-01T12:00:00Z",
  pinned: true,
  pinned_globally: true,
};

for (const mobile of [false, true]) {
  acceptance(
    `RPN latest activity | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.settings({
        desktop_category_page_style: "categories_with_featured_topics",
        mobile_category_page_style: "categories_with_featured_topics",
      });
      let responses;
      let queries;
      let failed;
      let categorySlug;
      let hasDefinition;
      let includeHierarchy;

      needs.hooks.beforeEach(() => {
        responses = [[oldPin, latest]];
        queries = [];
        failed = false;
        hasDefinition = true;
        includeHierarchy = false;
      });
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const category = response.category_list.categories[0];
          categorySlug = category.slug;
          category.topic_url = hasDefinition ? "/t/about-category/99999" : null;
          category.topics = [oldPin, latest, { ...oldPin, id: 11889 }];
          if (includeHierarchy) {
            response.category_list.categories =
              response.category_list.categories.filter((entry) =>
                [1, 2, 6, 17].includes(entry.id)
              );
          } else {
            response.category_list.categories = [category];
          }
          return helper.response(response);
        });
        server.get("/filter.json", (request) => {
          queries.push(request.queryParams.q);
          if (failed) {
            return helper.response(503, {});
          }
          return helper.response({
            users: [user],
            primary_groups: [],
            topic_list: { topics: cloneJSON(responses.shift() || []) },
          });
        });
      });

      const row = mobile
        ? 'div.category-list-item[data-category-id="1"]'
        : 'tr[data-category-id="1"]';
      const topic = mobile
        ? `${row} tr.category-topic-link`
        : `${row} .rpn-featured-topic`;
      const title = mobile ? `${topic} a[data-topic-id]` : `${topic} a.title`;

      test("one latest topic replaces pinned server previews and keeps the last poster", async function (assert) {
        await visit("/categories");
        assert.dom(topic).exists({ count: 1 });
        assert
          .dom(title)
          .hasText("Newest conversation")
          .hasAttribute("href", "/t/newest-conversation/11994/4");
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
        const metadata = mobile
          ? `${topic} .rpn-mobile-category-topic__meta`
          : `${topic} .rpn-featured-topic__meta`;
        assert
          .dom(`${metadata} [data-user-card="latest_replier"]`)
          .hasText("latest_replier")
          .hasAttribute("href", "/u/latest_replier");
        assert
          .dom(`${metadata} .last-posted-at`)
          .hasAttribute("href", "/t/newest-conversation/11994/7");
        assert.true(queries[0].includes(`=category:${categorySlug}`));
        assert.true(queries[0].includes("order:activity"));
        assert.true(queries[0].includes("status:listed"));
        assert.true(queries[0].includes("-topic:99999"));
      });

      test("a pinned topic appears when it really has the newest activity", async function (assert) {
        responses = [
          [{ ...oldPin, bumped_at: "2026-08-01T12:00:00Z" }, latest],
        ];
        await visit("/categories");
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Old global announcement");
      });

      test("continues past a page filled with global pins", async function (assert) {
        // Core disables pin promotion when a topic-ID exclusion is present.
        // Categories without a definition topic exercise the fallback.
        hasDefinition = false;
        const pins = Array.from({ length: 30 }, (_, index) => ({
          ...oldPin,
          id: 12000 + index,
        }));
        responses = [pins, [latest]];
        await visit("/categories");
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 2);
        assert.false(queries[0].includes("-topic:"));
        assert.true(
          queries[1].includes(`-topic:${pins.map((pin) => pin.id).join(",")}`)
        );
      });

      test("loads every displayed category without fetching nested badge categories", async function (assert) {
        includeHierarchy = true;
        responses = [[latest], [], [], []];
        await visit("/categories");

        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 4);
        assert.deepEqual(
          queries.map((query) => query.match(/=category:([^ ]+)/)[1]).sort(),
          ["bug", "feature", "support", "uncategorized"].sort(),
          "only displayed parent rows are fetched, including the fourth queued row"
        );
      });

      test("empty categories do not fall back to a sticky preview", async function (assert) {
        responses = [[]];
        await visit("/categories");
        assert.dom(topic).doesNotExist();
        assert.dom(".rpn-category-topic-loader button").doesNotExist();
      });

      test("failed requests offer retry without showing stale pins", async function (assert) {
        failed = true;
        await visit("/categories");
        assert.dom(topic).doesNotExist();
        assert
          .dom(".rpn-category-topic-loader [role=status]")
          .hasText("Latest activity could not be loaded.");
        failed = false;
        await click(".rpn-category-topic-loader button");
        assert.strictEqual(
          queries.length,
          2,
          "retry fetches the category again"
        );
        assert.dom(title).hasText("Newest conversation");
        assert.dom(".rpn-category-topic-loader button").doesNotExist();
      });

      test("reloads fresh activity when revisiting the category page", async function (assert) {
        await visit("/categories");
        await visit("/latest");
        responses = [
          [{ ...latest, title: "Fresh return", fancy_title: "Fresh return" }],
        ];
        await visit("/categories");
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Fresh return");
      });
    }
  );
}
