import Component from "@glimmer/component";
import { service } from "@ember/service";
import CategoryUnread from "discourse/components/category-unread";
import { apiInitializer } from "discourse/lib/api";
import { number } from "discourse/lib/formatter";
import { i18n } from "discourse-i18n";

class RpnCategoryTotal extends Component {
  @service site;

  get category() {
    return this.args.outletArgs.category;
  }

  get count() {
    return this.category.topics_all_time ?? this.category.topic_count ?? 0;
  }

  get formattedCount() {
    return number(this.count);
  }

  <template>
    <td class="topics topic-list-data num rpn-category-total">
      <div title={{i18n "categories.topic_sentence" count=this.count}}>
        {{#if this.site.mobileView}}
          <span class="value">{{i18n
              "categories.topic_sentence"
              count=this.count
            }}</span>
        {{else}}
          <span class="value">{{this.formattedCount}}</span>
        {{/if}}
      </div>
      <CategoryUnread
        class="unread-new"
        @category={{this.category}}
        @newTopicsCount={{this.category.newTopicsCount}}
        @tagName="div"
        @unreadTopicsCount={{this.category.unreadTopicsCount}}
      />
    </td>
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("category-list-topics-wrapper", RpnCategoryTotal);
  api.renderInOutlet(
    "category-list-after-title-mobile-section",
    RpnCategoryTotal
  );
});
