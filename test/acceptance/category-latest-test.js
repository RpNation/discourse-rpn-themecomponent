import { click, find, settled, visit, waitUntil } from "@ember/test-helpers";
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
      let latestResponses;
      let latestRequests;
      let failed;
      let responseDelay;
      let failureStatus;
      let categorySlug;
      let hasDefinition;
      let includeHierarchy;
      let knownEmpty;
      let nativeTopics;
      let categoryOverrides;
      let otherCategoryOverrides;

      needs.hooks.beforeEach(() => {
        responses = [[oldPin, latest]];
        queries = [];
        latestResponses = [[latest]];
        latestRequests = [];
        failed = false;
        responseDelay = 0;
        failureStatus = 503;
        hasDefinition = true;
        includeHierarchy = false;
        knownEmpty = false;
        nativeTopics = [];
        categoryOverrides = {};
        otherCategoryOverrides = {};
      });
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const category = response.category_list.categories[0];
          for (const entry of response.category_list.categories) {
            entry.topic_count = 100;
            entry.topics = [];
            Object.assign(
              entry,
              cloneJSON(otherCategoryOverrides[entry.id] || {})
            );
          }
          category.topic_count = knownEmpty ? 0 : 100;
          categorySlug = category.slug;
          category.topic_url = hasDefinition ? "/t/about-category/99999" : null;
          category.topics = cloneJSON(nativeTopics);
          Object.assign(category, categoryOverrides);
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
        server.get(
          "/filter.json",
          (request) => {
            queries.push(request.queryParams.q);
            // The beta parser treats negative definition IDs as inclusions;
            // native definition filtering then yields a successful empty list.
            if (request.queryParams.q.includes("-topic:")) {
              return helper.response({ users: [], topic_list: { topics: [] } });
            }
            if (failed) {
              return helper.response(failureStatus, {});
            }
            const response = responses.shift() || [];
            if (response === "error") {
              return helper.response(failureStatus, {});
            }
            return helper.response({
              users: [user],
              primary_groups: [],
              topic_list: { topics: cloneJSON(response) },
            });
          },
          () => responseDelay
        );
        server.get("/latest.json", (request) => {
          if (!request.queryParams.category) {
            return helper.response({ users: [], topic_list: { topics: [] } });
          }
          latestRequests.push(request.queryParams);
          const response = latestResponses.shift() || [];
          if (response === "error") {
            return helper.response(failureStatus, {});
          }
          return helper.response({
            users: [user],
            topic_list: { topics: cloneJSON(response) },
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

      test("keeps a parent native preview visible during refresh and replaces it with verified activity", async function (assert) {
        const preview = { ...oldPin, last_poster: user };
        delete preview.category_id;
        nativeTopics = [preview];
        categoryOverrides = { subcategory_ids: [999] };
        responseDelay = 2000;
        const visiting = visit("/categories");
        await waitUntil(
          () => queries.length === 1 && find(`${topic} img.avatar`),
          { timeout: 5000 }
        );
        assert.dom(title).hasText("Old global announcement");
        assert.dom(`${topic} [data-user-card="latest_replier"]`).exists();
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
        await visiting;
        assert.dom(title).hasText("Newest conversation");
        assert
          .dom(`${topic} .last-posted-at`)
          .hasAttribute("href", "/t/newest-conversation/11994/7");
      });

      test("retains a parent native preview after a failed refresh", async function (assert) {
        const preview = { ...oldPin, last_poster: user };
        delete preview.category_id;
        nativeTopics = [preview];
        categoryOverrides = { subcategory_ids: [999] };
        responseDelay = 2000;
        failed = true;
        failureStatus = 500;
        const visiting = visit("/categories");
        await waitUntil(
          () => queries.length === 1 && find(`${topic} img.avatar`),
          { timeout: 5000 }
        );
        assert.dom(title).hasText("Old global announcement");
        await visiting;
        assert.dom(title).hasText("Old global announcement");
        assert.dom(`${topic} img.avatar`).exists();
        assert.dom(`${topic} [data-user-card="latest_replier"]`).exists();
        assert.dom(".rpn-category-topic-loader button").exists();
      });

      if (!mobile) {
        test("updates a returning topic in place and keeps its avatar", async function (assert) {
          const preview = {
            ...latest,
            title: "Earlier title",
            fancy_title: "Earlier title",
            last_poster: user,
          };
          delete preview.category_id;
          nativeTopics = [preview];
          categoryOverrides = { subcategory_ids: [999], sort_order: "created" };
          responseDelay = 2000;
          const visiting = visit("/categories");
          await waitUntil(
            () => queries.length === 1 && find(`${topic} img.avatar`),
            { timeout: 5000 }
          );
          const originalRow = find(topic);
          const originalAvatarUrl = find(`${topic} img.avatar`).getAttribute(
            "src"
          );
          assert.dom(title).hasText("Earlier title");
          await visiting;
          assert.dom(title).hasText("Newest conversation");
          assert.strictEqual(find(topic), originalRow);
          // Core's avatar helper regenerates its HTML; the visible avatar and
          // keyed topic row should remain the same while metadata updates.
          assert
            .dom(`${topic} img.avatar`)
            .hasAttribute("src", originalAvatarUrl);
        });
      }

      test("reuses ordinary native previews without requests and preserves their last poster", async function (assert) {
        nativeTopics = [
          oldPin,
          { ...latest, last_poster: user },
          { ...oldPin, id: 11889 },
        ];
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.strictEqual(latestRequests.length, 0);
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Newest conversation");
        assert
          .dom(`${topic} img.avatar`)
          .hasAttribute("src", /rpn-latest-replier\.png$/);
        assert.dom(`${topic} [data-user-card="latest_replier"]`).exists();
      });

      test("follows native pin dismissals when an ordinary preview is present", async function (assert) {
        nativeTopics = [
          { ...latest, last_poster: user },
          { ...oldPin, pinned: false, unpinned: true },
        ];
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.dom(title).hasText("Newest conversation");
      });

      test("keeps an ambiguous native pin visible when refreshing fails", async function (assert) {
        nativeTopics = [{ ...oldPin, last_poster: user }];
        failed = true;
        await visit("/categories");
        assert.dom(topic).exists({ count: 1 });
        assert.dom(title).hasText("Old global announcement");
        assert.dom(".rpn-category-topic-loader button").exists();
        failed = false;
        await click(".rpn-category-topic-loader button");
        assert.dom(title).hasText("Newest conversation");
      });

      test("fetches when custom sorting cannot establish latest activity", async function (assert) {
        nativeTopics = [{ ...oldPin, pinned: false, pinned_globally: false }];
        categoryOverrides = { sort_order: "created", sort_ascending: false };
        await visit("/categories");
        assert.strictEqual(queries.length, 1);
        assert.dom(title).hasText("Newest conversation");
      });

      test("reuses complete small-category previews even with custom sorting and pins", async function (assert) {
        nativeTopics = [oldPin, { ...latest, last_poster: user }];
        categoryOverrides = {
          topic_count: 2,
          sort_order: "created",
          sort_ascending: true,
        };
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.dom(title).hasText("Newest conversation");
      });

      test("uses native parent previews without requiring topic category IDs", async function (assert) {
        const ambiguous = { ...oldPin, pinned: false, pinned_globally: false };
        delete ambiguous.category_id;
        nativeTopics = [ambiguous];
        categoryOverrides = {
          subcategory_ids: [999],
          subcategory_list: [
            { id: 999, name: "Child", slug: "child", parent_category_id: 1 },
          ],
        };
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.dom(title).hasText("Old global announcement");
      });

      test("infers a native preview's category for a row without children", async function (assert) {
        const ordinary = { ...latest, last_poster: user };
        delete ordinary.category_id;
        nativeTopics = [ordinary];
        categoryOverrides = { subcategory_ids: [], subcategory_list: [] };
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.dom(title).hasText("Newest conversation");
      });

      test("keeps the full native source array while projecting one featured topic", async function (assert) {
        nativeTopics = [
          oldPin,
          { ...latest, last_poster: user },
          { ...oldPin, id: 11889 },
        ];
        await visit("/categories");
        const category = Category.findById(1);
        assert.strictEqual(category.topics.length, 3);
        assert.deepEqual(
          category.topics.map((entry) => entry.id),
          [11888, 11994, 11889]
        );
        assert.dom(topic).exists({ count: 1 });
        assert.strictEqual(queries.length, 0);
      });

      test("shows native descendant activity when a parent has no direct topics", async function (assert) {
        nativeTopics = [{ ...latest, category_id: 999, last_poster: user }];
        categoryOverrides = { topic_count: 0, subcategory_ids: [999] };
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.dom(`${topic} img.avatar`).exists();
        assert.strictEqual(queries.length, 0);
      });

      test("refreshes another row once without mutating a shared native topic or poster", async function (assert) {
        includeHierarchy = true;
        const childPin = { ...oldPin, category_id: 2, last_poster: user };
        nativeTopics = [{ ...latest, category_id: 2, last_poster: user }];
        categoryOverrides = { subcategory_ids: [2] };
        otherCategoryOverrides = {
          2: { topics: [childPin] },
          6: {
            topic_count: 0,
            has_children: false,
            subcategory_count: 0,
            subcategory_ids: [],
            subcategory_list: [],
          },
          17: {
            topic_count: 0,
            has_children: false,
            subcategory_count: 0,
            subcategory_ids: [],
            subcategory_list: [],
          },
        };
        const updatedUser = {
          ...user,
          id: 9103,
          username: "updated_replier",
          avatar_template: "/images/updated-replier.png",
        };
        const updated = {
          ...latest,
          category_id: 2,
          title: "Updated elsewhere",
          fancy_title: "Updated elsewhere",
          last_poster_username: updatedUser.username,
          last_poster: updatedUser,
          posters: [],
        };
        responses = [[childPin], [updated]];
        latestResponses = [[updated]];
        responseDelay = 2000;
        const siblingRow = mobile
          ? 'div.category-list-item[data-category-id="2"]'
          : 'tr[data-category-id="2"]';
        const siblingTitle = mobile
          ? `${siblingRow} tr.category-topic-link a[data-topic-id]`
          : `${siblingRow} .rpn-featured-topic a.title`;
        const visiting = visit("/categories");
        await waitUntil(
          () => queries.length === 1 && find(`${topic} img.avatar`),
          { timeout: 5000 }
        );
        const nativeRecord = Category.findById(1).topics[0];
        const nativePoster = nativeRecord.last_poster;
        assert.dom(title).hasText("Newest conversation");
        assert.dom(siblingTitle).hasText("Old global announcement");
        await waitUntil(() => queries.length === 2, { timeout: 8000 });
        assert.dom(siblingTitle).hasText("Old global announcement");
        assert.dom(title).hasText("Newest conversation");
        await visiting;
        assert.dom(siblingTitle).hasText("Updated elsewhere");
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(Category.findById(1).topics[0], nativeRecord);
        assert.strictEqual(nativeRecord.last_poster, nativePoster);
        assert.strictEqual(nativePoster.username, "latest_replier");
        assert.strictEqual(queries.length, 2);
        assert.strictEqual(latestRequests.length, 1);
      });

      test("loads an ambiguous category appended to the same native list", async function (assert) {
        nativeTopics = [{ ...latest, last_poster: user }];
        await visit("/categories");
        const model = this.container.lookup(
          "controller:discovery/categories"
        ).model;
        const originalList = model.content;
        const appended = Category.findById(2);
        appended.setProperties({
          topics: [],
          topic_count: 100,
          subcategory_ids: [],
          subcategory_list: [],
        });
        responses = [
          [
            {
              ...latest,
              id: 13001,
              category_id: 2,
              title: "Lazy topic",
              fancy_title: "Lazy topic",
            },
          ],
        ];
        originalList.push(appended);
        await settled();
        const lazyTitle = mobile
          ? 'div.category-list-item[data-category-id="2"] tr.category-topic-link a[data-topic-id]'
          : 'tr[data-category-id="2"] .rpn-featured-topic a.title';
        await settled();
        assert.strictEqual(model.content, originalList);
        assert.strictEqual(
          appended.featuredTopics?.[0]?.id,
          13001,
          "appended model has its verified preview"
        );
        // Core's cached mobile filtered list does not render in-place appends.
        // Verify the loader/getter on both views; desktop also renders the row.
        assert.strictEqual(appended.featuredTopics.length, 1);
        assert.deepEqual(appended.topics, []);
        if (!mobile) {
          assert.dom(lazyTitle).hasText("Lazy topic");
        }
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 1);

        const nativeAppend = Category.findById(6);
        const nativeSource = [
          Topic.create({ ...oldPin, category_id: 6 }),
          Topic.create({ ...latest, category_id: 6, last_poster: user }),
        ];
        nativeAppend.set("topics", nativeSource);
        originalList.push(nativeAppend);
        assert.strictEqual(nativeAppend.featuredTopics.length, 1);
        assert.strictEqual(nativeAppend.featuredTopics[0], nativeSource[1]);
        await settled();
        assert.strictEqual(nativeAppend.topics, nativeSource);
        assert.strictEqual(
          queries.length,
          1,
          "ordinary native append makes no request"
        );
      });

      test("a fresh native array supersedes an earlier supplemental result", async function (assert) {
        await visit("/categories");
        assert.strictEqual(queries.length, 1);
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
        assert.strictEqual(queries.length, 1);
      });

      test("an in-flight supplemental response cannot overwrite a fresh native array", async function (assert) {
        nativeTopics = [{ ...oldPin, last_poster: user }];
        responseDelay = 2000;
        const visiting = visit("/categories");
        await waitUntil(
          () => queries.length === 1 && find(`${topic} img.avatar`),
          { timeout: 5000 }
        );
        const replacement = Topic.create({
          ...latest,
          id: 14001,
          title: "Fresh while loading",
          fancy_title: "Fresh while loading",
          last_poster: user,
        });
        const source = [replacement];
        Category.findById(1).set("topics", source);
        await visiting;
        await settled();
        assert.dom(title).hasText("Fresh while loading");
        assert.strictEqual(Category.findById(1).topics, source);
        assert.strictEqual(queries.length, 1);
      });

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
        assert.true(queries[0].includes(`category:${categorySlug}`));
        assert.true(queries[0].includes("order:activity"));
        assert.true(queries[0].includes("status:listed"));
        assert.false(queries[0].includes("-topic:"));
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
        // Global pins can fill a response before any ordinary topic appears.
        // Native activity sorting finds candidates behind the promoted pins.
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
        assert.false(queries.some((query) => query.includes("-topic:")));
        assert.true(queries[1].includes(` topic:${latest.id}`));
        assert.strictEqual(latestRequests.length, 1);
        assert.strictEqual(latestRequests[0].category, "1");
        assert.strictEqual(latestRequests[0].order, "bumped_at");
        assert.notStrictEqual(latestRequests[0].no_subcategories, "true");
      });

      test("retains the newest global pin when no ordinary topics remain", async function (assert) {
        hasDefinition = false;
        responses = [[oldPin], [oldPin]];
        latestResponses = [[oldPin]];
        await visit("/categories");
        assert.dom(title).hasText("Old global announcement");
        assert.strictEqual(queries.length, 2);
      });

      test("finds a newer global pin hidden behind thirty promoted announcements", async function (assert) {
        const pins = Array.from({ length: 30 }, (_, index) => ({
          ...oldPin,
          id: 12000 + index,
        }));
        const newestPin = {
          ...oldPin,
          id: 13000,
          fancy_title: "Newest global pin",
          title: "Newest global pin",
          bumped_at: "2026-09-01T00:00:00Z",
        };
        responses = [pins, [newestPin, latest]];
        latestResponses = [[newestPin, latest]];
        await visit("/categories");
        assert.dom(title).hasText("Newest global pin");
        assert.strictEqual(latestRequests.length, 1);
        assert.true(queries[1].includes(`topic:${newestPin.id},${latest.id}`));
      });

      test("skips definition topics before validating native activity candidates", async function (assert) {
        const definition = {
          ...latest,
          id: 99999,
          fancy_title: "About category",
          bumped_at: "2026-09-01T00:00:00Z",
        };
        responses = [[definition], [latest]];
        latestResponses = [[definition, latest]];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.true(queries[1].includes(`topic:${latest.id}`));
        assert.false(queries[1].includes("99999"));
      });

      test("native fallback failures offer a retry without selecting a stale pin", async function (assert) {
        responses = [[oldPin]];
        latestResponses = ["error"];
        await visit("/categories");
        assert.dom(topic).doesNotExist();
        assert.dom(".rpn-category-topic-loader button").exists();
        responses = [[oldPin], [latest]];
        latestResponses = [[latest]];
        await click(".rpn-category-topic-loader button");
        assert.dom(title).hasText("Newest conversation");
        assert.dom(".rpn-category-topic-loader button").doesNotExist();
        assert.strictEqual(latestRequests.length, 2);
      });

      test("checks another native page when filter visibility rejects the first page", async function (assert) {
        const hidden = Array.from({ length: 30 }, (_, index) => ({
          ...latest,
          id: 14000 + index,
          bumped_at: "2026-08-01T00:00:00Z",
        }));
        responses = [[oldPin], [], [latest]];
        latestResponses = [hidden, [latest]];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.deepEqual(
          latestRequests.map((request) => request.page),
          ["0", "1"]
        );
        assert.strictEqual(queries.length, 3);
      });

      test("batches displayed categories without fetching nested badge categories", async function (assert) {
        includeHierarchy = true;
        responses = [
          [1, 2, 6, 17].map((id) => ({
            ...latest,
            id: latest.id + id,
            category_id: id,
          })),
        ];
        await visit("/categories");

        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 1);
        assert.deepEqual(
          queries[0]
            .match(/=?category:([^ ]+)/)[1]
            .split(",")
            .sort(),
          ["bug", "feature", "support", "uncategorized"].sort(),
          "one request contains only the displayed parent rows"
        );
      });

      test("removes busy categories before fetching quieter categories", async function (assert) {
        includeHierarchy = true;
        responses = [
          [latest],
          [2, 6, 17].map((id) => ({
            ...latest,
            id: latest.id + id,
            category_id: id,
          })),
        ];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 2);
        assert.false(
          queries[1]
            .match(/=?category:([^ ]+)/)[1]
            .split(",")
            .includes(categorySlug)
        );
      });

      test("a global-only category remains unresolved while another category completes", async function (assert) {
        includeHierarchy = true;
        responses = [
          [oldPin, { ...latest, id: 11995, category_id: 2 }],
          [
            latest,
            ...[6, 17].map((id) => ({
              ...latest,
              id: latest.id + id,
              category_id: id,
            })),
          ],
        ];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 2);
        assert.true(
          queries[1]
            .match(/=?category:([^ ]+)/)[1]
            .split(",")
            .includes(categorySlug)
        );
      });

      test("retry preserves completed categories and requests only unresolved rows", async function (assert) {
        includeHierarchy = true;
        responses = [[latest], "error"];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert.dom(".rpn-category-topic-loader button").exists();
        responses = [
          [2, 6, 17].map((id) => ({
            ...latest,
            id: latest.id + id,
            category_id: id,
          })),
        ];
        await click(".rpn-category-topic-loader button");
        assert.dom(title).hasText("Newest conversation");
        assert.strictEqual(queries.length, 3);
        assert.false(
          queries[2]
            .match(/=?category:([^ ]+)/)[1]
            .split(",")
            .includes(categorySlug)
        );
        assert.dom(".rpn-category-topic-loader button").doesNotExist();
      });

      test("ignores topics returned outside the requested category", async function (assert) {
        responses = [
          [
            {
              ...latest,
              id: 12999,
              category_id: 999,
              bumped_at: "2026-09-01T12:00:00Z",
            },
            latest,
          ],
        ];
        await visit("/categories");
        assert.dom(title).hasText("Newest conversation");
        assert
          .dom(title)
          .hasAttribute("href", "/t/newest-conversation/11994/4");
      });

      test("known empty categories need no request and do not retain sticky previews", async function (assert) {
        knownEmpty = true;
        nativeTopics = [];
        await visit("/categories");
        assert.strictEqual(queries.length, 0);
        assert.dom(topic).doesNotExist();
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
