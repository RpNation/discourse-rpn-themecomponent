import Component from "@glimmer/component";
import { get } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";

const matchColumns = modifier((cell, [mobile]) => {
  const header = cell.closest("table")?.tHead;
  if (!header) {
    return;
  }

  const update = () => {
    const columns = [...(header.rows[0]?.cells || [])].reduce(
      (total, column) => total + column.colSpan,
      0
    );
    cell.colSpan = mobile ? 1 : Math.max(columns, 1);
  };

  update();
  // Bulk selection and custom columns change the native header. Observe only
  // that header; topic rows and their data remain entirely under core control.
  const observer = new MutationObserver(update);
  observer.observe(header, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["colspan"],
  });
  return () => observer.disconnect();
});

const SectionRow = <template>
  <tr class="rpn-topic-section rpn-topic-section--{{@kind}}">
    <td class="rpn-topic-section__cell" {{matchColumns @mobile}}>
      <h2 class="rpn-topic-section__title">{{@label}}</h2>
    </td>
  </tr>
</template>;

class PinnedTopicSection extends Component {
  @service site;

  get hasLeadingPins() {
    const firstTopic = this.args.outletArgs.topics?.[0];
    return firstTopic && get(firstTopic, "pinned");
  }

  <template>
    {{#if this.hasLeadingPins}}
      <tbody class="rpn-topic-section-group">
        <SectionRow
          @kind="pinned"
          @mobile={{this.site.mobileView}}
          @label={{i18n (themePrefix "topic_sections.pinned")}}
        />
      </tbody>
    {{/if}}
  </template>
}

class NormalTopicSection extends Component {
  @service site;

  get afterPin() {
    return get(this.args.outletArgs.topic, "pinned");
  }

  <template>
    {{#if this.afterPin}}
      <SectionRow
        @kind="normal"
        @mobile={{this.site.mobileView}}
        @label={{i18n (themePrefix "topic_sections.normal")}}
      />
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("before-topic-list-body", PinnedTopicSection);
  api.renderInOutlet("after-topic-list-item", NormalTopicSection);
});
