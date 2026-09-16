import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import ParentCategoryRow from "discourse/components/parent-category-row";
import { apiInitializer } from "discourse/lib/api";
import { MAX_UNOPTIMIZED_CATEGORIES } from "discourse/lib/constants";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import RpnCategoryDirectory from "../components/rpn-category-directory";
import RpnCategoryGroup from "../components/rpn-category-group";
import { buildCategoryGroups } from "../lib/rpn-category-groups";

const CategoryTableHead = <template>
  <tr>
    <th class="category topic-list-data default"><span
        id={{@headingId}}
        aria-level="2"
        role="heading"
      >{{i18n "categories.category"}}</span></th>
    <th class="topics topic-list-data num">{{i18n "categories.topics"}}</th>
    {{#if @showTopics}}<th class="latest">{{i18n
          "categories.latest"
        }}</th>{{/if}}
  </tr>
</template>;

const CategoryEntries = <template>
  {{#each @entries key="key" as |entry|}}
    {{#if entry.group}}
      <RpnCategoryGroup @group={{entry.group}} @showTopics={{@showTopics}} />
    {{else}}
      <ParentCategoryRow
        @category={{entry.category}}
        @showTopics={{@showTopics}}
      />
    {{/if}}
  {{/each}}
</template>;

class RpnCategoryGroups extends Component {
  @service discovery;
  @service router;
  @service site;
  @service siteSettings;

  @tracked showMuted = false;

  get categories() {
    return this.args.outletArgs.categories || [];
  }

  @cached
  get entries() {
    if (this.discovery.categoryListPage !== "categories") {
      return [];
    }
    return buildCategoryGroups(this.categories, settings.category_groups).map(
      (entry) => ({
        ...entry,
        key: entry.group?.key ?? `category:${entry.category.id}`,
      })
    );
  }

  get hasGroups() {
    return this.entries.some((entry) => entry.group);
  }

  get selectedGroup() {
    const queryParams = this.router.currentRoute?.queryParams;
    // Keep previously shared directory links working under the old name.
    const name = queryParams?.c_group ?? queryParams?.rpn_group;
    return this.entries.find((entry) => entry.group?.name === name)?.group;
  }

  get showTopics() {
    if (this.site.categories.length > MAX_UNOPTIMIZED_CATEGORIES) {
      return false;
    }
    const style = this.site.mobileView
      ? this.siteSettings.mobile_category_page_style
      : this.siteSettings.desktop_category_page_style;
    return style === "categories_with_featured_topics";
  }

  get mutedCategories() {
    return this.categories.filter((category) => category.hasMuted);
  }

  @action
  toggleMuted() {
    this.showMuted = !this.showMuted;
  }

  <template>
    {{#if this.selectedGroup}}
      <RpnCategoryDirectory
        @group={{this.selectedGroup}}
        @showTopics={{this.showTopics}}
      />
    {{else if this.hasGroups}}
      {{#if this.site.mobileView}}
        <div class="category-list {{if this.showTopics 'with-topics'}}">
          <CategoryEntries
            @entries={{this.entries}}
            @showTopics={{this.showTopics}}
          />
        </div>
      {{else}}
        <table class="category-list {{if this.showTopics 'with-topics'}}">
          <thead class="category-list-header">
            <CategoryTableHead
              @headingId="categories-only-category"
              @showTopics={{this.showTopics}}
            />
          </thead>
          <tbody aria-labelledby="categories-only-category">
            <CategoryEntries
              @entries={{this.entries}}
              @showTopics={{this.showTopics}}
            />
          </tbody>
        </table>
      {{/if}}

      {{#if this.mutedCategories}}
        <div class="muted-categories">
          <h3 class="muted-categories-heading">
            <button
              type="button"
              class="btn btn-flat muted-categories-link rpn-category-groups__muted-toggle"
              aria-expanded={{if this.showMuted "true" "false"}}
              {{on "click" this.toggleMuted}}
            >
              {{i18n "categories.muted"}}{{dIcon
                (if this.showMuted "minus" "plus")
              }}
            </button>
          </h3>
          {{#if this.site.mobileView}}
            <div
              class="category-list
                {{if this.showTopics 'with-topics'}}
                {{unless this.showMuted 'hidden'}}"
            >
              {{#each this.mutedCategories key="id" as |category|}}
                <ParentCategoryRow
                  @category={{category}}
                  @listType="muted"
                  @showTopics={{this.showTopics}}
                />
              {{/each}}
            </div>
          {{else}}
            <table
              class="category-list
                {{if this.showTopics 'with-topics'}}
                {{unless this.showMuted 'hidden'}}"
            >
              <thead class="category-list-header">
                <CategoryTableHead
                  @headingId="categories-only-category-muted"
                  @showTopics={{this.showTopics}}
                />
              </thead>
              <tbody aria-labelledby="categories-only-category-muted">
                {{#each this.mutedCategories key="id" as |category|}}
                  <ParentCategoryRow
                    @category={{category}}
                    @listType="muted"
                    @showTopics={{this.showTopics}}
                  />
                {{/each}}
              </tbody>
            </table>
          {{/if}}
        </div>
      {{/if}}
    {{else}}
      {{yield}}
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  api.modifyClass("controller:discovery/categories", {
    pluginId: "rpn-category-groups",
    queryParams: ["c_group", "rpn_group"],
    c_group: null,
    rpn_group: null,
  });
  api.modifyClass("route:discovery/categories", {
    pluginId: "rpn-category-groups",
    resetController(controller, isExiting) {
      this._super(...arguments);
      if (isExiting) {
        controller.setProperties({ c_group: null, rpn_group: null });
      }
    },
  });
  api.renderInOutlet("categories-only-wrapper", RpnCategoryGroups);
});
