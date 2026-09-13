import Component from "@glimmer/component";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import { MAX_UNOPTIMIZED_CATEGORIES } from "discourse/lib/constants";

function categoryId(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

class RpnCategorySection extends Component {
  @service discovery;
  @service site;
  @service siteSettings;

  get heading() {
    if (!Array.isArray(settings.category_sections)) {
      return null;
    }

    const id = categoryId(this.args.outletArgs.category.id);
    if (!id) {
      return null;
    }

    for (const section of settings.category_sections) {
      if (
        categoryId(section?.category_id) === id &&
        typeof section?.heading === "string" &&
        section.heading.trim()
      ) {
        return section.heading.trim();
      }
    }

    return null;
  }

  get columnCount() {
    // A category's topic page uses its own subcategory layout. The dedicated
    // categories/subcategories pages use the global style, with core's large
    // category-list fallback to the simpler two-column table.
    if (this.discovery.categoryListPage === "category") {
      return this.discovery.category?.subcategory_list_style ===
        "rows_with_featured_topics"
        ? 3
        : 2;
    }

    if (this.site.categories.length > MAX_UNOPTIMIZED_CATEGORIES) {
      return 2;
    }

    return [
      "categories_with_featured_topics",
      "subcategories_with_featured_topics",
    ].includes(this.siteSettings.desktop_category_page_style)
      ? 3
      : 2;
  }

  <template>
    {{#if this.heading}}
      {{#if this.site.mobileView}}
        <div
          class="rpn-category-section rpn-category-section--mobile"
          data-rpn-section-category-id={{@outletArgs.category.id}}
        >
          <h2 class="rpn-category-section__heading">{{this.heading}}</h2>
        </div>
      {{else}}
        <tr
          class="rpn-category-section"
          data-rpn-section-category-id={{@outletArgs.category.id}}
        >
          <td colspan={{this.columnCount}}>
            <h2 class="rpn-category-section__heading">{{this.heading}}</h2>
          </td>
        </tr>
      {{/if}}
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("category-list-above-each-category", RpnCategorySection);
});
