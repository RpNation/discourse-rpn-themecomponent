import { click, find, findAll, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { MAX_UNOPTIMIZED_CATEGORIES } from "discourse/lib/constants";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import siteFixtures from "discourse/tests/fixtures/site-fixtures";
import topFixtures from "discourse/tests/fixtures/top-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const sectionSelector = "tr.rpn-category-section";
const mobileSectionSelector = "div.rpn-category-section--mobile";
const categoryRows =
  'tbody[aria-labelledby="categories-only-category"] > tr[data-category-id]';

function sectionRow(categoryId) {
  return `${sectionSelector}[data-rpn-section-category-id="${categoryId}"]`;
}

function mobileSection(categoryId) {
  return `${mobileSectionSelector}[data-rpn-section-category-id="${categoryId}"]`;
}

function configureSections(needs, sections = []) {
  needs.hooks.beforeEach(() => {
    settings.category_sections = cloneJSON(sections);
  });
}

acceptance("RPN Foundation | Category sections", function (needs) {
  needs.settings({
    desktop_category_page_style: "categories_with_featured_topics",
  });
  configureSections(needs);

  test("starts without any site-specific section headings", async function (assert) {
    await visit("/categories");

    assert.dom(sectionSelector).doesNotExist();
    assert.dom(`${categoryRows}[data-category-id="1"]`).exists();
    assert.dom(`${categoryRows}[data-category-id="2"]`).exists();
  });

  test("renders arbitrary heading text immediately before its selected category", async function (assert) {
    settings.category_sections = [
      { heading: "Community & support", category_id: 1 },
      { heading: "Projects and ideas", category_id: 2 },
    ];

    await visit("/categories");

    assert.dom(sectionSelector).exists({ count: 2 });
    assert
      .dom(`${sectionRow(1)} .rpn-category-section__heading`)
      .hasText("Community & support");
    assert
      .dom(`${sectionRow(2)} .rpn-category-section__heading`)
      .hasText("Projects and ideas");
    for (const categoryId of [1, 2]) {
      assert.strictEqual(
        find(sectionRow(categoryId)).nextElementSibling.dataset.categoryId,
        String(categoryId),
        "the heading is a separate row immediately before its category"
      );
      assert.dom(`${sectionRow(categoryId)} > td`).exists({ count: 1 });
      assert.dom(`${sectionRow(categoryId)} > td`).hasAttribute("colspan", "3");
    }
  });

  test("escapes heading text instead of interpreting it as HTML", async function (assert) {
    const heading = '<img src=x onerror="alert(1)"> <b>Welcome</b> & news';
    settings.category_sections = [{ heading, category_id: 1 }];

    await visit("/categories");

    assert
      .dom(`${sectionRow(1)} .rpn-category-section__heading`)
      .hasText(heading);
    assert.dom(`${sectionRow(1)} img`).doesNotExist();
    assert.dom(`${sectionRow(1)} b`).doesNotExist();
  });

  test("keeps category order independent of section setting order", async function (assert) {
    settings.category_sections = [
      { heading: "Second section", category_id: 2 },
      { heading: "First section", category_id: 1 },
    ];

    await visit("/categories");

    assert.deepEqual(
      findAll(categoryRows)
        .slice(0, 2)
        .map((row) => row.dataset.categoryId),
      ["1", "2"],
      "section configuration does not reorder categories"
    );
    assert.deepEqual(
      findAll(sectionSelector).map((row) => row.dataset.rpnSectionCategoryId),
      ["1", "2"],
      "headings follow the existing category order"
    );
  });

  test("uses the first valid heading when a category is configured more than once", async function (assert) {
    settings.category_sections = [
      { heading: "   ", category_id: 1 },
      { heading: "  First valid heading  ", category_id: 1 },
      { heading: "Duplicate heading", category_id: 1 },
    ];

    await visit("/categories");

    assert.dom(sectionSelector).exists({ count: 1 });
    assert
      .dom(`${sectionRow(1)} .rpn-category-section__heading`)
      .hasText("First valid heading");
  });

  test("ignores invalid entries and category IDs without hiding valid entries", async function (assert) {
    settings.category_sections = [
      null,
      {},
      { heading: "Missing ID" },
      { heading: "Zero", category_id: 0 },
      { heading: "Negative", category_id: -1 },
      { heading: "Fractional", category_id: 1.5 },
      { heading: "Invalid suffix", category_id: "1x" },
      { heading: "Boolean", category_id: true },
      { heading: "Array", category_id: [1] },
      { heading: "Unsafe integer", category_id: Number.MAX_SAFE_INTEGER + 1 },
      { heading: 42, category_id: 1 },
      { heading: "   ", category_id: 2 },
      { heading: "Valid numeric ID", category_id: 1 },
      { heading: "Valid numeric string", category_id: "2" },
    ];

    await visit("/categories");

    assert.dom(sectionSelector).exists({ count: 2 });
    assert
      .dom(`${sectionRow(1)} .rpn-category-section__heading`)
      .hasText("Valid numeric ID");
    assert
      .dom(`${sectionRow(2)} .rpn-category-section__heading`)
      .hasText("Valid numeric string");
  });

  test("does not render orphan headings for categories absent from the page", async function (assert) {
    settings.category_sections = [
      { heading: "A missing category", category_id: 999999 },
      { heading: "A visible category", category_id: 1 },
    ];

    await visit("/categories");

    assert.dom(sectionSelector).exists({ count: 1 });
    assert.dom(sectionRow(999999)).doesNotExist();
    assert
      .dom(`${sectionRow(1)} .rpn-category-section__heading`)
      .hasText("A visible category");
  });
});

for (const [style, colspan] of [
  ["categories_with_featured_topics", "3"],
  ["subcategories_with_featured_topics", "3"],
  ["categories_only", "2"],
  ["categories_and_latest_topics", "2"],
  ["categories_and_top_topics", "2"],
]) {
  acceptance(`RPN Foundation | Category sections | ${style}`, function (needs) {
    needs.settings({ desktop_category_page_style: style });
    configureSections(needs, [{ heading: "Community", category_id: 1 }]);
    needs.pretender((server, helper) => {
      server.get("/categories_and_top", () =>
        helper.response({
          ...cloneJSON(discoveryFixtures["/categories.json"]),
          ...cloneJSON(topFixtures["/top.json"]),
        })
      );
    });

    test("renders a valid heading row spanning the layout's columns", async function (assert) {
      await visit("/categories");

      assert.dom(sectionRow(1)).exists({ count: 1 });
      assert.dom(`${sectionRow(1)} > td`).hasAttribute("colspan", colspan);
      assert.true(
        find(sectionRow(1)).parentElement.matches(
          "table.category-list > tbody"
        ),
        "section rows remain inside the category table body"
      );
      assert.strictEqual(
        find(sectionRow(1)).nextElementSibling.dataset.categoryId,
        "1"
      );
    });
  });
}

for (const style of ["categories_boxes", "categories_boxes_with_topics"]) {
  acceptance(`RPN Foundation | Category sections | ${style}`, function (needs) {
    needs.settings({ desktop_category_page_style: style });
    configureSections(needs, [{ heading: "Community", category_id: 1 }]);

    test("does not inject table headings into a box layout", async function (assert) {
      await visit("/categories");

      assert.dom(sectionSelector).doesNotExist();
      assert.dom(".rpn-category-section__heading").doesNotExist();
    });
  });
}

for (const style of [
  "categories_only",
  "categories_with_featured_topics",
  "subcategories_with_featured_topics",
]) {
  acceptance(
    `RPN Foundation | Category sections | mobile ${style}`,
    function (needs) {
      needs.mobileView();
      needs.settings({ mobile_category_page_style: style });
      configureSections(needs, [{ heading: "Community", category_id: 1 }]);

      test("renders its configured heading before the native mobile category", async function (assert) {
        await visit("/categories");

        assert.dom(mobileSection(1)).exists({ count: 1 }).isVisible();
        assert
          .dom(`${mobileSection(1)} > h2.rpn-category-section__heading`)
          .hasText("Community");
        assert.strictEqual(
          find(mobileSection(1)).nextElementSibling.dataset.categoryId,
          "1",
          "the heading immediately precedes its native category row"
        );
        assert.true(
          !!find(mobileSection(1)).closest("div.category-list"),
          "the mobile heading is a block inside the native category list"
        );
        assert.dom(sectionSelector).doesNotExist();
        assert.dom(".rpn-category-section > td").doesNotExist();
      });
    }
  );
}

acceptance(
  "RPN Foundation | Category sections | mobile settings",
  function (needs) {
    needs.mobileView();
    needs.settings({
      mobile_category_page_style: "categories_with_featured_topics",
    });
    configureSections(needs);

    test("does not add mobile sections until categories are configured", async function (assert) {
      await visit("/categories");

      assert.dom(mobileSectionSelector).doesNotExist();
      assert.dom('div.category-list [data-category-id="1"]').exists();
    });

    test("uses the first valid matching entry and ignores missing or invalid categories", async function (assert) {
      settings.category_sections = [
        null,
        {},
        { heading: "Invalid ID", category_id: "1x" },
        { heading: "Missing category", category_id: 999999 },
        { heading: "   ", category_id: 1 },
        { heading: 42, category_id: 1 },
        { heading: "  Community & support  ", category_id: "1" },
        { heading: "Duplicate heading", category_id: 1 },
      ];

      await visit("/categories");

      assert.dom(mobileSectionSelector).exists({ count: 1 });
      assert
        .dom(`${mobileSection(1)} .rpn-category-section__heading`)
        .hasText("Community & support");
      assert.dom(mobileSection(999999)).doesNotExist();
    });

    test("escapes mobile heading text instead of interpreting it as HTML", async function (assert) {
      const heading = '<img src=x onerror="alert(1)"> <b>Welcome</b> & news';
      settings.category_sections = [{ heading, category_id: 1 }];

      await visit("/categories");

      assert
        .dom(`${mobileSection(1)} .rpn-category-section__heading`)
        .hasText(heading);
      assert.dom(`${mobileSection(1)} img`).doesNotExist();
      assert.dom(`${mobileSection(1)} b`).doesNotExist();
    });

    test("does not leave orphan headings or duplicate them after navigation", async function (assert) {
      settings.category_sections = [{ heading: "Community", category_id: 1 }];

      await visit("/categories");
      assert.dom(mobileSection(1)).exists({ count: 1 });

      await visit("/latest");
      assert.dom(mobileSectionSelector).doesNotExist();

      await visit("/categories");
      assert.dom(mobileSection(1)).exists({ count: 1 }).isVisible();
      assert.strictEqual(
        find(mobileSection(1)).nextElementSibling.dataset.categoryId,
        "1"
      );
    });
  }
);

acceptance(
  "RPN Foundation | Category sections | mobile muted category",
  function (needs) {
    needs.mobileView();
    needs.settings({
      mobile_category_page_style: "categories_with_featured_topics",
    });
    configureSections(needs, [{ heading: "Muted projects", category_id: 1 }]);
    needs.pretender((server, helper) => {
      server.get("/categories.json", () => {
        const response = cloneJSON(discoveryFixtures["/categories.json"]);
        response.category_list.categories[0].notification_level = 0;
        return helper.response(response);
      });
    });

    test("keeps the heading paired with its hidden or expanded muted category", async function (assert) {
      const mutedHeading = `.muted-categories ${mobileSection(1)}`;
      await visit("/categories");

      assert.dom(mobileSection(1)).exists({ count: 1 });
      assert.dom(mutedHeading).isNotVisible();

      await click(".muted-categories-link");

      assert.dom(mutedHeading).isVisible().hasText("Muted projects");
      assert.strictEqual(
        find(mutedHeading).nextElementSibling.dataset.categoryId,
        "1",
        "the heading stays immediately before the muted category"
      );

      await click(".muted-categories-link");
      assert.dom(mutedHeading).isNotVisible();

      await click(".muted-categories-link");
      assert.dom(mutedHeading).exists({ count: 1 }).isVisible();
    });
  }
);

for (const [subcategoryStyle, globalStyle, topicColspan, listColspan] of [
  ["rows", "categories_with_featured_topics", "2", "3"],
  ["rows_with_featured_topics", "categories_only", "3", "2"],
]) {
  acceptance(
    `RPN Foundation | Category sections | Subcategory style ${subcategoryStyle}`,
    function (needs) {
      const categories = cloneJSON(siteFixtures["site.json"].site.categories);
      const parent = categories.find((category) => category.id === 2);
      parent.show_subcategory_list = true;
      parent.subcategory_list_style = subcategoryStyle;
      needs.site({ categories });
      needs.settings({ desktop_category_page_style: globalStyle });
      configureSections(needs, [{ heading: "Project areas", category_id: 26 }]);
      needs.pretender((server, helper) => {
        server.get("/categories.json", () => {
          const response = cloneJSON(discoveryFixtures["/categories.json"]);
          const parentCategory = response.category_list.categories.find(
            (category) => category.id === 2
          );
          const child = parentCategory.subcategory_list[0];
          child.topics = cloneJSON(parentCategory.topics);
          response.category_list.categories = [child];
          return helper.response(response);
        });
      });

      test("uses the parent category's row style above its topic list", async function (assert) {
        await visit("/c/feature/2");

        assert.dom(sectionRow(26)).exists({ count: 1 });
        assert
          .dom(`${sectionRow(26)} > td`)
          .hasAttribute("colspan", topicColspan);
        assert.strictEqual(
          find(sectionRow(26)).nextElementSibling.dataset.categoryId,
          "26"
        );
        assert.strictEqual(
          find(sectionRow(26))
            .closest("table")
            .classList.contains("with-topics"),
          topicColspan === "3",
          "the heading matches the actual topic-page category layout"
        );
      });

      test("uses the global style on the dedicated subcategories route", async function (assert) {
        await visit("/c/feature/2/subcategories");

        assert.dom(sectionRow(26)).exists({ count: 1 });
        assert
          .dom(`${sectionRow(26)} > td`)
          .hasAttribute("colspan", listColspan);
        assert.strictEqual(
          find(sectionRow(26))
            .closest("table")
            .classList.contains("with-topics"),
          listColspan === "3",
          "the dedicated route uses the site's category list layout"
        );
      });
    }
  );
}

acceptance("RPN Foundation | Category sections | Large site", function (needs) {
  const categories = cloneJSON(siteFixtures["site.json"].site.categories);
  const extraCategories = Array.from(
    { length: MAX_UNOPTIMIZED_CATEGORIES + 1 },
    (_, index) => ({
      id: 10000 + index,
      name: `Extra category ${index}`,
      slug: `extra-category-${index}`,
      color: "0088CC",
      text_color: "FFFFFF",
      style_type: "square",
    })
  );
  needs.site({ categories: [...categories, ...extraCategories] });
  needs.settings({
    desktop_category_page_style: "categories_with_featured_topics",
  });
  configureSections(needs, [{ heading: "Community", category_id: 1 }]);

  test("matches the categories-only fallback instead of the configured featured layout", async function (assert) {
    await visit("/categories");

    assert.dom(sectionRow(1)).exists({ count: 1 });
    assert.dom(`${sectionRow(1)} > td`).hasAttribute("colspan", "2");
    assert.dom("table.category-list.with-topics").doesNotExist();
  });
});

acceptance(
  "RPN Foundation | Category sections | Muted category",
  function (needs) {
    needs.settings({
      desktop_category_page_style: "categories_with_featured_topics",
    });
    configureSections(needs, [{ heading: "Muted projects", category_id: 1 }]);
    needs.pretender((server, helper) => {
      server.get("/categories.json", () => {
        const response = cloneJSON(discoveryFixtures["/categories.json"]);
        response.category_list.categories[0].notification_level = 0;
        return helper.response(response);
      });
    });

    test("keeps a muted category's heading in its collapsed list until expanded", async function (assert) {
      const normalHeading =
        'tbody[aria-labelledby="categories-only-category"] > .rpn-category-section';
      const mutedHeading =
        'tbody[aria-labelledby="categories-only-category-muted"] > .rpn-category-section';

      await visit("/categories");

      assert.dom(normalHeading).doesNotExist();
      assert.dom(mutedHeading).exists({ count: 1 }).isNotVisible();
      assert.dom(sectionRow(1)).exists({ count: 1 });

      await click(".muted-categories-link");

      assert.dom(normalHeading).doesNotExist();
      assert.dom(mutedHeading).isVisible().hasText("Muted projects");
      assert.dom(`${mutedHeading} > td`).hasAttribute("colspan", "3");
      assert.strictEqual(
        find(mutedHeading).nextElementSibling.dataset.categoryId,
        "1",
        "the heading stays paired with the muted category"
      );
    });
  }
);
