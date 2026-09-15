import { click, find, visit } from "@ember/test-helpers";
import { test } from "qunit";
import sinon from "sinon";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const anonymousKey = "rpn-category-sections:anonymous";
const userKey = "rpn-category-sections:42";
const section = (id) =>
  `.rpn-category-section[data-rpn-section-category-id="${id}"]`;
const toggle = (id) => `${section(id)} .rpn-category-section__toggle`;

function configure(needs, { saved = {}, blockedStorage = false } = {}) {
  let storageRead;
  let storageWrite;
  needs.settings({
    desktop_category_page_style: "categories_with_featured_topics",
    mobile_category_page_style: "categories_with_featured_topics",
  });
  needs.hooks.beforeEach(() => {
    window.localStorage.removeItem(anonymousKey);
    window.localStorage.removeItem(userKey);
    for (const [key, value] of Object.entries(saved)) {
      window.localStorage.setItem(key, value);
    }
    if (blockedStorage) {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      storageRead = sinon
        .stub(Storage.prototype, "getItem")
        .callsFake(function (key) {
          if (key === anonymousKey) {
            throw new Error("Storage is unavailable");
          }
          return getItem.call(this, key);
        });
      storageWrite = sinon
        .stub(Storage.prototype, "setItem")
        .callsFake(function (key, value) {
          if (key === anonymousKey) {
            throw new Error("Storage is unavailable");
          }
          return setItem.call(this, key, value);
        });
    }
    settings.category_sections = [
      { heading: "Roleplays", category_id: 1 },
      { heading: "Archives", category_id: 3 },
    ];
  });
  needs.hooks.afterEach(() => {
    storageRead?.restore();
    storageWrite?.restore();
    window.localStorage.removeItem(anonymousKey);
    window.localStorage.removeItem(userKey);
  });
  needs.pretender((server, helper) => {
    server.get("/categories.json", () => {
      const response = cloneJSON(discoveryFixtures["/categories.json"]);
      const categories = response.category_list.categories;
      response.category_list.categories = [1, 2, 3].map((id) =>
        categories.find((category) => category.id === id)
      );
      return helper.response(response);
    });
  });
}

for (const mobile of [false, true]) {
  const viewport = mobile ? "mobile" : "desktop";
  const row = (id) =>
    `${mobile ? "div.category-list-item" : "tr"}[data-category-id="${id}"]`;
  acceptance(
    `RPN Foundation | Category section collapse | ${viewport}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      configure(needs);

      const subcategory = `${row(2)} .subcategories a`;
      const topic = `${row(1)} ${mobile ? "tr.category-topic-link" : ".rpn-featured-topic"}`;

      test("collapses all section rows and subforums independently without replacing previews", async function (assert) {
        await visit("/categories");

        assert.dom(toggle(1)).hasTagName("button");
        assert.dom(toggle(1)).hasAttribute("aria-expanded", "true");
        assert.dom(toggle(1)).hasAttribute("aria-label", "Collapse Roleplays");
        assert.dom(subcategory).exists({ count: 1 }).isVisible();
        assert.dom(topic).exists({ count: 1 });
        assert.dom(`${topic} img.avatar`).exists({ count: 1 });
        const topicElement = find(topic);
        const avatarElement = find(`${topic} img.avatar`);

        await click(toggle(1));

        assert.dom(toggle(1)).hasAttribute("aria-expanded", "false");
        assert.dom(toggle(1)).hasAttribute("aria-label", "Expand Roleplays");
        assert.dom(section(1)).isVisible();
        assert.dom(row(1)).exists().isNotVisible();
        assert.dom(row(2)).exists().isNotVisible();
        assert.dom(subcategory).exists().isNotVisible();
        assert.dom(row(3)).isVisible();
        assert.deepEqual(JSON.parse(localStorage.getItem(anonymousKey)), [1]);

        await click(toggle(3));
        assert.dom(row(3)).isNotVisible();
        assert.dom(section(3)).isVisible();

        await click(toggle(1));
        assert.dom(row(1)).isVisible();
        assert.dom(row(2)).isVisible();
        assert.dom(subcategory).isVisible();
        assert.dom(row(3)).isNotVisible();
        assert.strictEqual(
          find(topic),
          topicElement,
          "the same topic stays mounted"
        );
        assert.strictEqual(
          find(`${topic} img.avatar`),
          avatarElement,
          "the same avatar stays mounted"
        );

        await click(toggle(3));
        assert.dom(row(3)).isVisible();
        assert.deepEqual(JSON.parse(localStorage.getItem(anonymousKey)), []);
      });

      test("remembers collapse across navigation and cleans up section styles", async function (assert) {
        const sentinel = document.createElement("meta");
        sentinel.name = "rpn-collapse-head-preservation";
        document.head.append(sentinel);
        const stylesheets = [
          ...document.head.querySelectorAll('link[rel="stylesheet"]'),
        ];
        const assertHeadPreserved = () => {
          assert.strictEqual(sentinel.parentNode, document.head);
          assert.true(
            stylesheets.every(
              (stylesheet) => stylesheet.parentNode === document.head
            ),
            "existing stylesheet link nodes remain in the document head"
          );
        };
        try {
          await visit("/categories");
          assertHeadPreserved();
          await click(toggle(1));
          assertHeadPreserved();
          await visit("/latest");

          assert.dom(".rpn-category-section").doesNotExist();
          assert.strictEqual(
            document.head.querySelectorAll("style[data-rpn-section-style]")
              .length,
            0,
            "leaving categories removes its scoped styles"
          );
          assertHeadPreserved();

          await visit("/categories");
          assert.dom(toggle(1)).hasAttribute("aria-expanded", "false");
          assert.dom(row(1)).isNotVisible();
          assert.dom(row(2)).isNotVisible();
          assert.dom(row(3)).isVisible();
          assertHeadPreserved();
        } finally {
          sentinel.remove();
        }
      });
    }
  );

  acceptance(
    `RPN Foundation | Category section collapse | ${viewport} saved preference`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      configure(needs, { saved: { [anonymousKey]: JSON.stringify([1]) } });

      test("restores saved collapse before category rows first become visible", async function (assert) {
        let firstDisplay;
        const observer = new MutationObserver(() => {
          const element = find(row(1));
          if (element && firstDisplay === undefined) {
            firstDisplay = getComputedStyle(element).display;
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        try {
          await visit("/categories");
          assert.strictEqual(
            firstDisplay,
            "none",
            "no expanded-row flash during startup"
          );
          assert.dom(toggle(1)).hasAttribute("aria-expanded", "false");
          assert.dom(row(1)).isNotVisible();
          assert.dom(row(2)).isNotVisible();
          assert.dom(row(3)).isVisible();
        } finally {
          observer.disconnect();
        }
      });
    }
  );

  acceptance(
    `RPN Foundation | Category section collapse | ${viewport} invalid preference`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      configure(needs, { saved: { [anonymousKey]: "{broken preference" } });

      test("invalid saved JSON defaults to expanded sections", async function (assert) {
        await visit("/categories");

        assert.dom(toggle(1)).hasAttribute("aria-expanded", "true");
        assert.dom(row(1)).isVisible();
        assert.dom(row(3)).isVisible();
        await click(toggle(1));
        assert.deepEqual(JSON.parse(localStorage.getItem(anonymousKey)), [1]);
      });
    }
  );

  acceptance(
    `RPN Foundation | Category section collapse | ${viewport} unavailable storage`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      configure(needs, { blockedStorage: true });

      test("unavailable storage still allows toggling and navigation", async function (assert) {
        await visit("/categories");
        assert.dom(row(1)).isVisible();
        await click(toggle(1));
        assert.dom(row(1)).isNotVisible();
        await visit("/latest");
        await visit("/categories");
        assert.dom(row(1)).isNotVisible();
        await click(toggle(1));
        assert.dom(row(1)).isVisible();
      });
    }
  );
}

acceptance(
  "RPN Foundation | Category section collapse | Account preference",
  function (needs) {
    needs.user({ id: 42 });
    configure(needs, {
      saved: {
        [anonymousKey]: JSON.stringify([3]),
        [userKey]: JSON.stringify([1]),
      },
    });

    test("keeps a signed-in user's choice separate from the anonymous choice", async function (assert) {
      await visit("/categories");

      assert.dom(toggle(1)).hasAttribute("aria-expanded", "false");
      assert.dom(toggle(3)).hasAttribute("aria-expanded", "true");
      await click(toggle(1));
      assert.deepEqual(JSON.parse(localStorage.getItem(userKey)), []);
      assert.deepEqual(JSON.parse(localStorage.getItem(anonymousKey)), [3]);
    });
  }
);
