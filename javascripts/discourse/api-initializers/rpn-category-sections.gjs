import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import { MAX_UNOPTIMIZED_CATEGORIES } from "discourse/lib/constants";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

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

class SectionPreferences {
  @tracked collapsed = [];

  constructor(userId) {
    this.storageKey = `rpn-category-sections:${userId || "anonymous"}`;
    try {
      const saved = JSON.parse(window.localStorage.getItem(this.storageKey));
      if (Array.isArray(saved)) {
        this.collapsed = [...new Set(saved.map(categoryId).filter(Boolean))];
      }
    } catch {
      // Collapsing still works for this session when storage is unavailable.
    }
  }

  toggle(id) {
    this.collapsed = this.collapsed.includes(id)
      ? this.collapsed.filter((entry) => entry !== id)
      : [...this.collapsed, id];

    try {
      window.localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.collapsed)
      );
    } catch {
      // Keep the in-memory choice even if the browser cannot save it.
    }
  }
}

let preferences;

const SectionToggle = <template>
  <button
    type="button"
    class="rpn-category-section__toggle"
    aria-expanded={{@expanded}}
    aria-label={{@label}}
    {{on "click" @toggle}}
  >
    <span class="rpn-category-section__label">{{@heading}}</span>
    {{dIcon "chevron-down" class="rpn-category-section__chevron"}}
  </button>
</template>;

class RpnCategorySection extends Component {
  @service discovery;
  @service site;
  @service siteSettings;

  get id() {
    return categoryId(this.args.outletArgs.category.id);
  }

  get collapsed() {
    return preferences.collapsed.includes(this.id);
  }

  get expanded() {
    return String(!this.collapsed);
  }

  get toggleLabel() {
    return i18n(
      themePrefix(
        this.collapsed
          ? "category_sections.expand"
          : "category_sections.collapse"
      ),
      { heading: this.heading }
    );
  }

  get documentHead() {
    return document.head;
  }

  get collapseStyle() {
    // Scope each rule to its own validated numeric ID. The exclusion stops at
    // the next header, so adjacent collapsed sections remain independent.
    // Native rows (including nested subforums and topic previews) stay mounted.
    const section = `.rpn-category-section[data-rpn-section-category-id="${this.id}"]`;
    return `${section}[data-rpn-section-collapsed="true"] ~ [data-category-id]:not(${section} ~ .rpn-category-section ~ [data-category-id]) { display: none; }`;
  }

  @action
  toggle() {
    preferences.toggle(this.id);
  }

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
      {{#in-element this.documentHead insertBefore=null}}
        {{! eslint-disable ember/template-no-forbidden-elements }}
        <style data-rpn-section-style={{this.id}}>
          {{this.collapseStyle}}
        </style>
      {{/in-element}}
      {{#if this.site.mobileView}}
        <div
          class="rpn-category-section rpn-category-section--mobile"
          data-rpn-section-category-id={{@outletArgs.category.id}}
          data-rpn-section-collapsed={{if this.collapsed "true" "false"}}
        >
          <h2 class="rpn-category-section__heading">
            <SectionToggle
              @expanded={{this.expanded}}
              @label={{this.toggleLabel}}
              @heading={{this.heading}}
              @toggle={{this.toggle}}
            />
          </h2>
        </div>
      {{else}}
        <tr
          class="rpn-category-section"
          data-rpn-section-category-id={{@outletArgs.category.id}}
          data-rpn-section-collapsed={{if this.collapsed "true" "false"}}
        >
          <td colspan={{this.columnCount}}>
            <h2 class="rpn-category-section__heading">
              <SectionToggle
                @expanded={{this.expanded}}
                @label={{this.toggleLabel}}
                @heading={{this.heading}}
                @toggle={{this.toggle}}
              />
            </h2>
          </td>
        </tr>
      {{/if}}
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  preferences = new SectionPreferences(api.getCurrentUser()?.id);
  api.renderInOutlet("category-list-above-each-category", RpnCategorySection);
});
