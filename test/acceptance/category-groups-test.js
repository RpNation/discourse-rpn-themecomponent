import { click, currentURL, find, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import Category from "discourse/models/category";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import siteFixtures from "discourse/tests/fixtures/site-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const groupSelector = ".rpn-category-group";
const membersSelector = `${groupSelector} .rpn-category-group__members`;
const headingLinkSelector = `${groupSelector} .rpn-category-group__name a`;
const directorySelector = ".rpn-category-directory";
const projectSelector = `${directorySelector} .rpn-category-directory__project`;
const group = {
  name: "Hosted Projects",
  description: "Long-term projects with their own forums.",
  icon: "globe",
  category_ids: [1, 2],
};
const directoryUrl = `/categories?rpn_group=${encodeURIComponent(group.name)}`;

function categoriesResponse() {
  const response = cloneJSON(discoveryFixtures["/categories.json"]);
  for (const category of response.category_list.categories) {
    category.topics_all_time = category.id === 1 ? 10 : 20;
    category.topic_count = 3;
    category.notification_level = 1;
  }
  const first = response.category_list.categories.find((c) => c.id === 1);
  const second = response.category_list.categories.find((c) => c.id === 2);
  const topic = second.topics[0];
  Object.assign(topic, {
    title: "Latest project conversation",
    fancy_title: "Latest project conversation",
    category_id: 2,
    bumped_at: "2026-09-16T12:00:00Z",
    last_posted_at: "2026-09-16T12:00:00Z",
    last_poster: {
      id: 9102,
      username: "project_author",
      avatar_template: "/images/project-author.png",
    },
  });
  first.topics.forEach((entry) => {
    entry.bumped_at = "2026-01-01T12:00:00Z";
  });
  return response;
}

for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Category groups | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.settings({
        navigation_menu: "sidebar",
        desktop_category_page_style: "categories_with_featured_topics",
        mobile_category_page_style: "categories_with_featured_topics",
      });
      let response;
      let supplementalRequests;
      needs.hooks.beforeEach(() => {
        window.localStorage.removeItem("rpn-category-sections:anonymous");
        settings.category_groups = [cloneJSON(group)];
        settings.category_sections = [];
        response = categoriesResponse();
        supplementalRequests = [];
      });
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => helper.response(response));
        ["/filter.json", "/latest.json"].forEach((path) => {
          server.get(path, (request) => {
            supplementalRequests.push(request.url);
            return helper.response(500, {});
          });
        });
      });
      needs.hooks.afterEach(function (assert) {
        window.localStorage.removeItem("rpn-category-sections:anonymous");
        assert.deepEqual(
          supplementalRequests,
          [],
          "grouping uses the category response without background topic requests"
        );
      });

      const nativeRow = (id) =>
        `${mobile ? "div.category-list-item" : "tr"}[data-category-id="${id}"]:not(.rpn-category-group)`;
      const latestSelector = `${groupSelector} .rpn-category-latest .rpn-featured-topic`;
      const latestTitle = `${latestSelector} a.title`;

      test("replaces selected rows with a summary and links to the real categories", async function (assert) {
        await visit("/categories");

        assert.dom(groupSelector).exists({ count: 1 });
        assert
          .dom(`${groupSelector} .rpn-category-group__name`)
          .hasText("Hosted Projects");
        assert.dom(headingLinkSelector).hasText("Hosted Projects");
        const groupUrl = new URL(find(headingLinkSelector).href);
        assert.strictEqual(groupUrl.pathname, "/categories");
        assert.strictEqual(
          groupUrl.searchParams.get("rpn_group"),
          "Hosted Projects",
          "the heading opens the project directory"
        );
        assert.false(groupUrl.searchParams.has("q"));
        assert.dom(groupSelector).includesText(group.description);
        assert.dom(groupSelector).hasAttribute("data-category-id", "1");
        assert
          .dom(groupSelector)
          .hasAttribute("data-rpn-group-name", "Hosted Projects");
        assert
          .dom(`${membersSelector} a[href="${Category.findById(1).url}"]`)
          .hasText("bug");
        assert
          .dom(`${membersSelector} a[href="${Category.findById(2).url}"]`)
          .hasText("feature");
        assert
          .dom(`${groupSelector} .rpn-category-group__total`)
          .includesText("30");
        assert.dom(nativeRow(1)).doesNotExist();
        assert.dom(nativeRow(2)).doesNotExist();
        assert.dom(nativeRow(3)).exists();
        assert
          .dom(`${nativeRow(3)} a[href="${Category.findById(3).url}"]`)
          .exists();
        if (mobile) {
          assert
            .dom("div.category-list-item.category.rpn-category-group")
            .exists();
          assert.dom(`${groupSelector} > td`).doesNotExist();
        } else {
          assert
            .dom("table.category-list > tbody > tr.rpn-category-group")
            .exists();
        }
      });

      test("opens a directory of projects and their real subcategories, then returns to categories", async function (assert) {
        const parentIds = [1, 2, 26].map(
          (id) => Category.findById(id).parent_category_id
        );
        await visit("/categories");
        await click(headingLinkSelector);

        assert.strictEqual(
          new URL(currentURL(), window.location.origin).searchParams.get(
            "rpn_group"
          ),
          group.name
        );
        assert.dom(directorySelector).exists();
        assert.dom(`${directorySelector} h1`).hasText(group.name);
        assert.dom(directorySelector).includesText(group.description);
        assert.dom(projectSelector).exists({ count: 2 });
        for (const id of [1, 2]) {
          const project = `${projectSelector}[data-category-id="${id}"]`;
          assert.dom(project).exists();
          assert
            .dom(`${projectSelector} a[href="${Category.findById(id).url}"]`)
            .exists();
          assert
            .dom(`${project} .rpn-category-directory__total`)
            .includesText(id === 1 ? "10" : "20");
          assert.dom(`${project} .rpn-featured-topic`).exists({ count: 1 });
        }
        assert
          .dom(
            `${projectSelector}[data-category-id="2"] a[href="${Category.findById(26).url}"]`
          )
          .exists();
        assert.dom(`${projectSelector}[data-category-id="3"]`).doesNotExist();
        assert.dom(groupSelector).doesNotExist();
        if (mobile) {
          assert
            .dom(
              `${directorySelector} .category-list.with-topics > div.category-list-item.category`
            )
            .exists({ count: 2 });
          assert.dom(`${projectSelector} > td`).doesNotExist();
        } else {
          assert
            .dom(
              `${directorySelector} table.category-list.with-topics > tbody > tr.rpn-category-directory__project`
            )
            .exists({ count: 2 });
          assert.dom(`${directorySelector} th.topics`).hasText("Topics");
          assert.dom(`${directorySelector} th.latest`).hasText("Latest");
        }
        assert.dom(".topic-list").doesNotExist();
        assert.dom(".rpn-category-section").doesNotExist();
        assert.deepEqual(
          [1, 2, 26].map((id) => Category.findById(id).parent_category_id),
          parentIds,
          "opening a directory preserves the real category hierarchy"
        );

        assert
          .dom(`${directorySelector} .rpn-category-directory__back`)
          .hasText("All categories")
          .hasAttribute("href", "/categories");
        await click(`${directorySelector} .rpn-category-directory__back`);

        assert.strictEqual(currentURL(), "/categories");
        assert.dom(directorySelector).doesNotExist();
        assert.dom(groupSelector).exists();
        assert.dom(nativeRow(3)).exists();

        await click(headingLinkSelector);

        assert.dom(directorySelector).exists();
        assert.dom(`${directorySelector} h1`).hasText(group.name);
      });

      test("directory projects keep their own native previews and stable avatars when counts change", async function (assert) {
        await visit(directoryUrl);

        const category = Category.findById(2);
        const topics = category.topics;
        const latest = topics[0];
        const poster = latest.last_poster;
        const project = `${projectSelector}[data-category-id="2"]`;
        const preview = `${project} .rpn-category-latest .rpn-featured-topic`;
        assert.dom(`${preview} a.title`).hasText("Latest project conversation");
        assert.dom(preview).hasAttribute("data-topic-id", String(latest.id));
        assert
          .dom(`${preview} img.avatar`)
          .hasAttribute("src", /project-author\.png$/);
        assert.dom(`${preview} [data-user-card="project_author"]`).exists();
        assert
          .dom(
            `${projectSelector}[data-category-id="1"] [data-topic-id="${latest.id}"]`
          )
          .doesNotExist(
            "each project uses its own preview, not the group's latest topic"
          );
        const avatar = find(`${preview} img.avatar`);

        category.set("topics_all_time", 25);
        category.set("description_excerpt", "Updated project description");
        await settled();

        assert
          .dom(`${project} .rpn-category-directory__total`)
          .includesText("25");
        assert.dom(project).includesText("Updated project description");
        assert.strictEqual(find(`${preview} img.avatar`), avatar);
        assert.strictEqual(category.topics, topics);
        assert.strictEqual(category.topics[0], latest);
        assert.strictEqual(latest.last_poster, poster);
      });

      test("native Categories navigation leaves the directory", async function (assert) {
        await visit(directoryUrl);
        if (mobile) {
          await click(".list-control-toggle-link-trigger");
        }
        await click(".nav-item_categories a");

        assert.strictEqual(currentURL(), "/categories");
        assert.dom(directorySelector).doesNotExist();
        assert.dom(groupSelector).exists();
        assert.dom(nativeRow(3)).exists();
        if (mobile) {
          assert
            .dom(".nav-item_categories a")
            .doesNotExist(
              "the native mobile navigation menu closes after leaving the directory"
            );
        }

        await click(headingLinkSelector);

        assert.dom(directorySelector).exists();
      });

      test("sidebar All categories clears the active group", async function (assert) {
        await visit(directoryUrl);
        if (mobile) {
          await click(".hamburger-dropdown button");
        }
        await click('a.sidebar-section-link[data-link-name="all-categories"]');

        assert.strictEqual(currentURL(), "/categories");
        assert.dom(directorySelector).doesNotExist();
        assert.dom(groupSelector).exists();
        assert.dom(nativeRow(3)).exists();
        if (mobile) {
          assert.dom(".hamburger-panel").doesNotExist();
        }

        await click(headingLinkSelector);

        assert.dom(directorySelector).exists();
      });

      test("loads the directory directly and ignores collapsed homepage sections", async function (assert) {
        settings.category_sections = [{ heading: "Projects", category_id: 1 }];
        await visit("/categories");
        await click(
          '.rpn-category-section[data-rpn-section-category-id="1"] .rpn-category-section__toggle'
        );
        assert.dom(groupSelector).isNotVisible();

        await visit(directoryUrl);

        assert.dom(directorySelector).isVisible();
        assert.dom(`${projectSelector}[data-category-id="1"]`).isVisible();
        assert.dom(`${projectSelector}[data-category-id="2"]`).isVisible();
        assert
          .dom(`${directorySelector} a[href="${Category.findById(26).url}"]`)
          .isVisible();
        assert.dom(".rpn-category-section").doesNotExist();
        assert.dom(".topic-list").doesNotExist();
      });

      test("falls back to normal categories for unknown and unavailable group names", async function (assert) {
        settings.category_groups = [
          cloneJSON(group),
          { ...group, name: "Unavailable projects", category_ids: [999999] },
        ];
        for (const name of ["Missing group", "Unavailable projects"]) {
          await visit(`/categories?rpn_group=${encodeURIComponent(name)}`);

          assert.dom(directorySelector).doesNotExist();
          assert.dom(groupSelector).exists({ count: 1 });
          assert.dom(nativeRow(3)).exists();
        }
      });

      test("uses the native latest topic and keeps its avatar stable without changing category ancestry", async function (assert) {
        const parentIds = [1, 2, 26].map(
          (id) => Category.findById(id).parent_category_id
        );
        await visit("/categories");

        const category = Category.findById(2);
        const topics = category.topics;
        const latest = topics[0];
        const poster = latest.last_poster;
        assert.dom(latestTitle).hasText("Latest project conversation");
        assert
          .dom(`${latestSelector} img.avatar`)
          .hasAttribute("src", /project-author\.png$/);
        assert
          .dom(`${latestSelector} [data-user-card="project_author"]`)
          .exists();
        const image = find(`${latestSelector} img.avatar`);
        category.set(
          "description_excerpt",
          "Updated real category description"
        );
        await settled();

        assert.strictEqual(find(`${latestSelector} img.avatar`), image);
        assert.strictEqual(category.topics, topics);
        assert.strictEqual(category.topics[0], latest);
        assert.strictEqual(latest.last_poster, poster);
        assert.deepEqual(
          [1, 2, 26].map((id) => Category.findById(id).parent_category_id),
          parentIds,
          "visual grouping never changes the real parent/subcategory hierarchy"
        );
        assert.strictEqual(Category.findById(26).parent_category_id, 2);

        Category.findById(1).set("topics_all_time", 15);
        await settled();

        assert
          .dom(`${groupSelector} .rpn-category-group__total`)
          .includesText(
            "35",
            "native in-place count changes update the group total"
          );
        assert.strictEqual(
          find(`${latestSelector} img.avatar`),
          image,
          "updating the total does not replace the latest avatar"
        );
      });

      test("keeps the ordinary category list when groups are not configured", async function (assert) {
        settings.category_groups = [];
        await visit("/categories");

        assert.dom(groupSelector).doesNotExist();
        assert.dom(nativeRow(1)).exists();
        assert.dom(nativeRow(2)).exists();
        assert
          .dom(`${nativeRow(2)} a[href="${Category.findById(26).url}"]`)
          .exists();
      });

      test("escapes the group name and description", async function (assert) {
        const name = "<b>Hosted & shared</b>";
        const description = '<img src=x onerror="alert(1)"> Projects';
        settings.category_groups = [{ ...group, name, description }];
        await visit("/categories");

        assert.dom(`${groupSelector} .rpn-category-group__name`).hasText(name);
        assert.dom(groupSelector).includesText(description);
        assert.dom(`${groupSelector} b`).doesNotExist();
        assert.dom(`${groupSelector} img[onerror]`).doesNotExist();
        assert.strictEqual(
          new URL(find(headingLinkSelector).href).searchParams.get("rpn_group"),
          name,
          "the directory name retains punctuation as an encoded URL parameter"
        );

        await click(headingLinkSelector);

        assert.dom(`${directorySelector} h1`).hasText(name);
        assert.dom(directorySelector).includesText(description);
        assert.dom(`${directorySelector} b`).doesNotExist();
        assert.dom(`${directorySelector} img[onerror]`).doesNotExist();
      });

      test("does not expose configured categories absent from the native response", async function (assert) {
        response.category_list.categories =
          response.category_list.categories.filter(
            (category) => category.id !== 3
          );
        settings.category_groups = [
          { ...group, category_ids: [1, 3, 999999] },
          { ...group, name: "Unavailable projects", category_ids: [3, 999999] },
        ];
        await visit("/categories");

        assert.dom(groupSelector).exists({ count: 1 });
        assert
          .dom(`${membersSelector} a[href="${Category.findById(1).url}"]`)
          .exists();
        assert
          .dom(`${membersSelector} a[href="${Category.findById(3).url}"]`)
          .doesNotExist();
        assert
          .dom('[data-rpn-group-name="Unavailable projects"]')
          .doesNotExist();
        assert
          .dom(`${groupSelector} .rpn-category-group__total`)
          .includesText("10");
        await click(headingLinkSelector);

        assert.dom(`${projectSelector}[data-category-id="1"]`).exists();
        assert.dom(`${projectSelector}[data-category-id="3"]`).doesNotExist();
        assert
          .dom(`${directorySelector} a[href="${Category.findById(3).url}"]`)
          .doesNotExist();
        assert
          .dom(`${projectSelector}[data-category-id="999999"]`)
          .doesNotExist();
      });

      test("leaves muted categories in the native expandable muted list", async function (assert) {
        response.category_list.categories.find(
          (c) => c.id === 1
        ).notification_level = 0;
        await visit("/categories");

        assert
          .dom(`${membersSelector} a[href="${Category.findById(1).url}"]`)
          .doesNotExist();
        assert
          .dom(`${membersSelector} a[href="${Category.findById(2).url}"]`)
          .exists();
        assert
          .dom(`${groupSelector} .rpn-category-group__total`)
          .includesText("20");
        assert.dom(`.muted-categories ${nativeRow(1)}`).isNotVisible();

        await click(".muted-categories-link");

        assert.dom(`.muted-categories ${nativeRow(1)}`).isVisible();
        assert.dom(".muted-categories .rpn-category-group").doesNotExist();

        await click(headingLinkSelector);

        assert.dom(`${projectSelector}[data-category-id="1"]`).doesNotExist();
        assert.dom(`${projectSelector}[data-category-id="2"]`).exists();
        assert.dom(".muted-categories").doesNotExist();
      });

      test("collapses the group with its section without replacing its latest avatar", async function (assert) {
        settings.category_sections = [
          { heading: "Projects", category_id: 1 },
          { heading: "Other forums", category_id: 3 },
        ];
        await visit("/categories");

        const section =
          '.rpn-category-section[data-rpn-section-category-id="1"]';
        const toggle = `${section} .rpn-category-section__toggle`;
        const avatar = find(`${latestSelector} img.avatar`);
        assert.dom(toggle).hasAttribute("aria-expanded", "true");
        assert.dom(groupSelector).isVisible();

        await click(toggle);

        assert.dom(toggle).hasAttribute("aria-expanded", "false");
        assert.dom(groupSelector).exists().isNotVisible();
        assert.dom(`${membersSelector} a`).exists().isNotVisible();
        assert.dom(nativeRow(3)).isVisible();

        await click(toggle);

        assert.dom(groupSelector).isVisible();
        assert.dom(`${membersSelector} a`).isVisible();
        assert.strictEqual(find(`${latestSelector} img.avatar`), avatar);
      });
    }
  );
}

for (const style of [
  "categories_only",
  "categories_boxes",
  "categories_boxes_with_topics",
]) {
  acceptance(`RPN Foundation | Category groups | ${style}`, function (needs) {
    needs.settings({ desktop_category_page_style: style });
    needs.hooks.beforeEach(() => {
      settings.category_groups = [cloneJSON(group)];
      settings.category_sections = [];
    });

    test("respects the selected category layout", async function (assert) {
      await visit("/categories");

      if (style === "categories_only") {
        assert.dom(groupSelector).exists();
        assert.dom(`${groupSelector} > td.latest`).doesNotExist();

        await click(headingLinkSelector);

        assert.dom(directorySelector).exists();
        assert.dom(projectSelector).exists({ count: 2 });
        assert.dom(`${directorySelector} th.latest`).doesNotExist();
        assert.dom(`${projectSelector} > td.latest`).doesNotExist();
        assert.dom(`${directorySelector} .rpn-featured-topic`).doesNotExist();
      } else {
        assert.dom(groupSelector).doesNotExist();
        assert
          .dom(
            style === "categories_boxes"
              ? ".category-boxes"
              : ".category-boxes-with-topics"
          )
          .exists();
      }
    });
  });
}

acceptance(
  "RPN Foundation | Category groups | category routes",
  function (needs) {
    const categories = cloneJSON(siteFixtures["site.json"].site.categories);
    const parent = categories.find((category) => category.id === 2);
    parent.show_subcategory_list = true;
    parent.subcategory_list_style = "rows_with_featured_topics";
    needs.site({ categories });
    needs.settings({
      desktop_category_page_style: "categories_with_featured_topics",
    });
    needs.hooks.beforeEach(() => {
      settings.category_groups = [{ ...group, category_ids: [26] }];
      settings.category_sections = [];
    });
    needs.pretender((server, helper) => {
      server.get("/categories.json", () => {
        const response = categoriesResponse();
        const category = response.category_list.categories.find(
          (c) => c.id === 2
        );
        const child = category.subcategory_list[0];
        child.topics = category.topics;
        response.category_list.categories = [child];
        return helper.response(response);
      });
    });

    test("leaves the real subcategory page unchanged", async function (assert) {
      await visit("/c/feature/2/subcategories");

      assert.dom(groupSelector).doesNotExist();
      assert.dom('tr[data-category-id="26"]').exists();
      assert.strictEqual(Category.findById(26).parent_category_id, 2);
    });
  }
);
