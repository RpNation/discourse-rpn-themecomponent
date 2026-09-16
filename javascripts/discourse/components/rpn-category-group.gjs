import Component from "@glimmer/component";
import { service } from "@ember/service";
import PluginOutlet from "discourse/components/plugin-outlet";
import SubCategoryItem from "discourse/components/sub-category-item";
import borderColor from "discourse/helpers/border-color";
import categoryColorVariable from "discourse/helpers/category-color-variable";
import lazyHash from "discourse/helpers/lazy-hash";
import { number } from "discourse/lib/formatter";
import getURL from "discourse/lib/get-url";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import RpnFeaturedTopic from "./rpn-featured-topic";

const GroupDetails = <template>
  <h3
    class="rpn-category-group__name"
    style={{categoryColorVariable @group.color}}
  >
    <a href={{@directoryUrl}}>
      {{#if @group.icon}}{{dIcon @group.icon}}{{/if}}
      <span>{{@group.name}}</span>
    </a>
  </h3>
  {{#if @group.description}}
    <div class="category-description">{{@group.description}}</div>
  {{/if}}
  <nav
    class="subcategories rpn-category-group__members"
    aria-label={{i18n
      (themePrefix "category_groups.members_label")
      name=@group.name
    }}
  >
    {{#each @group.members key="id" as |category|}}
      <SubCategoryItem @category={{category}} />
    {{/each}}
  </nav>
</template>;

export default class RpnCategoryGroup extends Component {
  @service site;

  get formattedCount() {
    return number(this.args.group.topicCount);
  }

  get directoryUrl() {
    return getURL(
      `/categories?c_group=${encodeURIComponent(this.args.group.name)}`
    );
  }

  <template>
    <PluginOutlet
      @name="category-list-above-each-category"
      @outletArgs={{lazyHash category=@group.anchor}}
    />
    {{#if this.site.mobileView}}
      <div
        class="category-list-item category rpn-category-group"
        data-category-id={{@group.anchor.id}}
        data-rpn-group-name={{@group.name}}
        style={{borderColor @group.color}}
      >
        <GroupDetails @group={{@group}} @directoryUrl={{this.directoryUrl}} />
        <div class="rpn-category-group__total">{{i18n
            "categories.topic_sentence"
            count=@group.topicCount
          }}</div>
        {{#if @showTopics}}
          {{#if @group.topic}}
            <div class="latest rpn-category-latest"><RpnFeaturedTopic
                @topic={{@group.topic}}
              /></div>
          {{/if}}
        {{/if}}
      </div>
    {{else}}
      <tr
        class="rpn-category-group has-description no-logo"
        data-category-id={{@group.anchor.id}}
        data-rpn-group-name={{@group.name}}
      >
        <td
          class="category"
          style={{categoryColorVariable @group.color}}
        ><GroupDetails
            @group={{@group}}
            @directoryUrl={{this.directoryUrl}}
          /></td>
        <td class="topics topic-list-data num rpn-category-group__total">
          <span
            title={{i18n "categories.topic_sentence" count=@group.topicCount}}
          >{{this.formattedCount}}</span>
        </td>
        {{#if @showTopics}}
          <td class="latest rpn-category-latest">
            {{#if @group.topic}}<RpnFeaturedTopic
                @topic={{@group.topic}}
              />{{/if}}
          </td>
        {{/if}}
      </tr>
    {{/if}}
  </template>
}
