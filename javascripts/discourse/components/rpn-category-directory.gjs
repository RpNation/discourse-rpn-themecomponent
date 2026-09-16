import Component from "@glimmer/component";
import { registerDestructor } from "@ember/destroyable";
import { hash } from "@ember/helper";
import { action, get } from "@ember/object";
import { LinkTo } from "@ember/routing";
import { service } from "@ember/service";
import CategoryTitleLink from "discourse/components/category-title-link";
import CategoryUnread from "discourse/components/category-unread";
import SubCategoryItem from "discourse/components/sub-category-item";
import bodyClass from "discourse/helpers/body-class";
import borderColor from "discourse/helpers/border-color";
import categoryColorVariable from "discourse/helpers/category-color-variable";
import categoryListSubcategories from "discourse/helpers/category-list-subcategories";
import { number } from "discourse/lib/formatter";
import { gt } from "discourse/truth-helpers";
import DDecoratedHtml from "discourse/ui-kit/d-decorated-html";
import dDirSpan from "discourse/ui-kit/helpers/d-dir-span";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import RpnFeaturedTopic from "./rpn-featured-topic";

const ProjectDetails = <template>
  {{#if @category.description_excerpt}}
    <div class="category-description">
      <DDecoratedHtml
        @html={{dDirSpan @category.description_excerpt htmlSafe="true"}}
      />
    </div>
  {{/if}}
  {{#if @subcategories}}
    <nav
      class="subcategories rpn-category-directory__subcategories"
      aria-label={{i18n
        (themePrefix "category_groups.subcategories_label")
        name=@category.name
      }}
    >
      {{#each @subcategories key="id" as |category|}}
        <SubCategoryItem @category={{category}} />
      {{/each}}
    </nav>
  {{/if}}
  {{#if (gt @unloadedSubcategoryCount 0)}}
    <LinkTo @route="discovery.subcategories" @model={{@slugPath}}>
      {{i18n "category_row.subcategory_count" count=@unloadedSubcategoryCount}}
    </LinkTo>
  {{/if}}
</template>;

const ProjectCount = <template>
  <div title={{i18n "categories.topic_sentence" count=@count}}>
    <span class="value">
      {{#if @mobile}}
        {{i18n "categories.topic_sentence" count=@count}}
      {{else}}
        {{@formattedCount}}
      {{/if}}
    </span>
  </div>
  <CategoryUnread
    class="unread-new"
    @category={{@category}}
    @newTopicsCount={{@category.newTopicsCount}}
    @tagName="div"
    @unreadTopicsCount={{@category.unreadTopicsCount}}
  />
</template>;

const ProjectPreview = <template>
  {{#each @category.featuredTopics key="id" as |topic|}}
    <RpnFeaturedTopic @topic={{topic}} />
  {{/each}}
</template>;

class Project extends Component {
  @service site;

  get count() {
    return (
      get(this.args.category, "topics_all_time") ??
      get(this.args.category, "topic_count") ??
      0
    );
  }

  get formattedCount() {
    return number(this.count);
  }

  get subcategories() {
    return categoryListSubcategories(this.args.category, {
      page: "categories",
    }).filter((category) => !category.isHidden && !category.hasMuted);
  }

  get unloadedSubcategoryCount() {
    return this.args.category.unloadedSubcategoryCount;
  }

  get slugPath() {
    return this.args.category.path.substring("/c/".length);
  }

  <template>
    {{#if this.site.mobileView}}
      <div
        class="category-list-item category rpn-category-directory__project"
        data-category-id={{@category.id}}
        style={{borderColor @category.color}}
      >
        <CategoryTitleLink @category={{@category}} />
        <div class="rpn-category-total rpn-category-directory__total">
          <ProjectCount
            @category={{@category}}
            @count={{this.count}}
            @mobile={{true}}
          />
        </div>
        <ProjectDetails
          @category={{@category}}
          @subcategories={{this.subcategories}}
          @unloadedSubcategoryCount={{this.unloadedSubcategoryCount}}
          @slugPath={{this.slugPath}}
        />
        {{#if @showTopics}}
          <div class="latest rpn-category-latest">
            <ProjectPreview @category={{@category}} />
          </div>
        {{/if}}
      </div>
    {{else}}
      <tr
        class="rpn-category-directory__project
          {{if
            @category.description_excerpt
            'has-description'
            'no-description'
          }}
          {{if @category.uploaded_logo.url 'has-logo' 'no-logo'}}"
        data-category-id={{@category.id}}
      >
        <td class="category" style={{categoryColorVariable @category.color}}>
          <CategoryTitleLink @category={{@category}} />
          <ProjectDetails
            @category={{@category}}
            @subcategories={{this.subcategories}}
            @unloadedSubcategoryCount={{this.unloadedSubcategoryCount}}
            @slugPath={{this.slugPath}}
          />
        </td>
        <td
          class="topics topic-list-data num rpn-category-total rpn-category-directory__total"
        >
          <ProjectCount
            @category={{@category}}
            @count={{this.count}}
            @formattedCount={{this.formattedCount}}
          />
        </td>
        {{#if @showTopics}}
          <td class="latest rpn-category-latest">
            <ProjectPreview @category={{@category}} />
          </td>
        {{/if}}
      </tr>
    {{/if}}
  </template>
}

export default class RpnCategoryDirectory extends Component {
  @service router;
  @service site;

  constructor() {
    super(...arguments);
    // Native LinkTo navigation retains the current query parameters. Clear
    // this directory when its general Categories links are activated. Keep
    // the listener scoped to this mounted view and leave modified clicks native.
    document.addEventListener("click", this.returnToCategories, true);
    registerDestructor(this, () => {
      document.removeEventListener("click", this.returnToCategories, true);
    });
  }

  @action
  returnToCategories(event) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented ||
      !event.target.closest?.(
        'a.sidebar-section-link[data-link-name="all-categories"], .nav-item_categories a'
      )
    ) {
      return;
    }

    // Let the event bubble so native menus still dismiss after navigation.
    event.preventDefault();
    this.router.transitionTo("discovery.categories", {
      queryParams: { c_group: null, rpn_group: null },
    });
  }

  <template>
    {{bodyClass "rpn-category-directory-page"}}
    <section
      class="rpn-category-directory"
      aria-labelledby="rpn-directory-title"
    >
      <LinkTo
        class="rpn-category-directory__back"
        @route="discovery.categories"
        @query={{hash c_group=null rpn_group=null}}
      >
        {{dIcon "arrow-left"}}{{i18n "sidebar.all_categories"}}
      </LinkTo>
      <header
        class="rpn-category-directory__header"
        style={{categoryColorVariable @group.color}}
      >
        <h1 id="rpn-directory-title">
          {{#if @group.icon}}{{dIcon @group.icon}}{{/if}}
          {{@group.name}}
        </h1>
        {{#if @group.description}}<p>{{@group.description}}</p>{{/if}}
      </header>
      {{#if this.site.mobileView}}
        <div class="category-list {{if @showTopics 'with-topics'}}">
          {{#each @group.members key="id" as |category|}}
            <Project @category={{category}} @showTopics={{@showTopics}} />
          {{/each}}
        </div>
      {{else}}
        <table class="category-list {{if @showTopics 'with-topics'}}">
          <thead class="category-list-header">
            <tr>
              <th class="category topic-list-data default">{{i18n
                  "categories.category"
                }}</th>
              <th class="topics topic-list-data num">{{i18n
                  "categories.topics"
                }}</th>
              {{#if @showTopics}}<th class="latest">{{i18n
                    "categories.latest"
                  }}</th>{{/if}}
            </tr>
          </thead>
          <tbody aria-labelledby="rpn-directory-title">
            {{#each @group.members key="id" as |category|}}
              <Project @category={{category}} @showTopics={{@showTopics}} />
            {{/each}}
          </tbody>
        </table>
      {{/if}}
    </section>
  </template>
}
