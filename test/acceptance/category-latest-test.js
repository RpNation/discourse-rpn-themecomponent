import { find, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import Category from "discourse/models/category";
import Topic from "discourse/models/topic";
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
    `RPN native category preview | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.settings({
        desktop_category_page_style: "categories_with_featured_topics",
        mobile_category_page_style: "categories_with_featured_topics",
      });
      let nativeTopics;
      let categoryOverrides;
      let childTopics;
      let requests;
      needs.hooks.beforeEach(() => {
        nativeTopics = [
          {
            ...oldPin,
            last_poster: {
              ...user,
              username: "old_author",
              avatar_template: "/images/old-author.png",
            },
          },
          { ...latest, last_poster: user },
          {
            ...oldPin,
            id: 11889,
            pinned: false,
            last_poster: {
              ...user,
              username: "third_author",
              avatar_template: "/images/third-author.png",
            },
          },
        ];
        categoryOverrides = {};
        childTopics = null;
        requests = [];
      });
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const categories = response.category_list.categories;
          const category = categories[0];
          Object.assign(
            category,
            {
              topic_count: 100,
              topic_url: "/t/about-category/99999",
              topics: cloneJSON(nativeTopics),
            },
            categoryOverrides
          );
          response.category_list.categories = [category];
          if (childTopics) {
            const child = categories.find((entry) => entry.id === 2);
            Object.assign(child, {
              topics: cloneJSON(childTopics),
              topic_count: 100,
            });
            response.category_list.categories.push(child);
          }
          return helper.response(response);
        });
        server.get("/filter.json", (request) => {
          requests.push(request.url);
          return helper.response(500, {});
        });
        server.get("/latest.json", (request) => {
          requests.push(request.url);
          return helper.response(500, {});
        });
      });
      needs.hooks.afterEach(function (assert) {
        assert.deepEqual(
          requests,
          [],
          "native previews never make supplemental requests"
        );
      });
      const row = mobile
        ? 'div.category-list-item[data-category-id="1"]'
        : 'tr[data-category-id="1"]';
      const topic = mobile
        ? `${row} tr.category-topic-link`
        : `${row} .rpn-featured-topic`;
      const title = mobile ? `${topic} a[data-topic-id]` : `${topic} a.title`;

      test("selects one native topic and its own avatar without changing source records", async function (assert) {
        await visit("/categories");
        const category = Category.findById(1);
        const source = category.topics;
        const selected = category.featuredTopics[0];
        const poster = selected.last_poster;
        assert.strictEqual(source.length, 3);
        assert.strictEqual(selected, source[1]);
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Newest conversation");
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
        assert.dom(`${topic} [data-user-card="latest_replier"]`).exists();
        const avatarUrl = find(`${topic} img.avatar`).getAttribute("src");
        category.set("description_excerpt", "Updated category description");
        await settled();
        assert.strictEqual(category.topics, source);
        assert.strictEqual(category.featuredTopics[0], selected);
        assert.strictEqual(selected.last_poster, poster);
        assert.dom(`${topic} img.avatar`).hasAttribute("src", avatarUrl);
      });

      test("includes a pin when its activity is newest", async function (assert) {
        nativeTopics[0].bumped_at = "2026-07-01T12:00:00Z";
        await visit("/categories");
        assert.dom(title).hasText("Old global announcement");
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /old-author\.png$/);
      });

      test("keeps the newest supplied pin stable when every preview is pinned", async function (assert) {
        nativeTopics = nativeTopics.map((entry) => ({
          ...entry,
          pinned: true,
        }));
        await visit("/categories");
        const selected = Category.findById(1).featuredTopics[0];
        await settled();
        assert.strictEqual(Category.findById(1).featuredTopics[0], selected);
        assert.dom(title).hasText("Newest conversation");
        assert.dom(".rpn-category-topic-loader").doesNotExist();
      });

      test("chooses newest provided activity under a custom category sort", async function (assert) {
        categoryOverrides = { sort_order: "created", sort_ascending: true };
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.dom(topic).exists({ count: 1 });
      });

      test("preserves a direct-empty parent's descendant topic and embedded poster", async function (assert) {
        nativeTopics = [{ ...latest, category_id: 2, last_poster: user }];
        categoryOverrides = {
          topic_count: 0,
          subcategory_ids: [2],
          has_children: true,
        };
        await visit("/categories");
        const category = Category.findById(1);
        assert.strictEqual(category.featuredTopics[0], category.topics[0]);
        assert.dom(title).hasText("Newest conversation");
        assert.dom(`${topic} [data-user-card="latest_replier"]`).exists();
      });

      test("leaves a missing native preview empty without loading or retry controls", async function (assert) {
        nativeTopics = [];
        await visit("/categories");
        assert.dom(topic).doesNotExist();
        assert.dom(".rpn-category-topic-loader").doesNotExist();
        assert.deepEqual(Category.findById(1).featuredTopics, []);
      });

      test("updates only when core supplies a fresh native topic array", async function (assert) {
        await visit("/categories");
        const replacement = Topic.create({
          ...latest,
          id: 14000,
          title: "Fresh native",
          fancy_title: "Fresh native",
          last_poster: user,
        });
        const source = [replacement];
        Category.findById(1).set("topics", source);
        await settled();
        assert.dom(title).hasText("Fresh native");
        assert.strictEqual(Category.findById(1).topics, source);
        assert.strictEqual(Category.findById(1).featuredTopics[0], replacement);
      });

      test("shared parent and child records retain their native author", async function (assert) {
        nativeTopics = [{ ...latest, category_id: 2, last_poster: user }];
        categoryOverrides = { subcategory_ids: [2] };
        childTopics = nativeTopics;
        await visit("/categories");
        const parent = Category.findById(1);
        const child = Category.findById(2);
        const shared = parent.topics[0];
        const poster = shared.last_poster;
        child.set("topics", [shared]);
        await settled();
        assert.strictEqual(parent.featuredTopics[0], shared);
        assert.strictEqual(child.featuredTopics[0], shared);
        assert.strictEqual(shared.last_poster, poster);
        assert.strictEqual(poster.username, "latest_replier");
        const childRow = mobile
          ? 'div.category-list-item[data-category-id="2"]'
          : 'tr[data-category-id="2"]';
        assert
          .dom(`${childRow} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
      });

      test("projects an appended native category synchronously without changing its array", async function (assert) {
        await visit("/categories");
        const list = this.container.lookup("controller:discovery/categories")
          .model.content;
        const appended = Category.findById(2);
        const source = nativeTopics.map((entry) =>
          Topic.create({ ...entry, category_id: 2 })
        );
        appended.set("topics", source);
        list.push(appended);
        assert.strictEqual(
          appended.featuredTopics.length,
          1,
          "projection is ready before the row renders"
        );
        assert.strictEqual(appended.featuredTopics[0], source[1]);
        await settled();
        assert.strictEqual(appended.topics, source);
        assert.strictEqual(source.length, 3);
        // Native mobile's cached filtered list does not render in-place appends.
        // Its getter is still ready; desktop renders the appended row directly.
        if (!mobile) {
          assert
            .dom('tr[data-category-id="2"] .rpn-featured-topic a.title')
            .hasText("Newest conversation");
        }
      });
    }
  );
}
