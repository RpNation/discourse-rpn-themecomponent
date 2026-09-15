import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { cancel, scheduleOnce } from "@ember/runloop";
import { modifier } from "ember-modifier";
import { apiInitializer } from "discourse/lib/api";
import DUserAvatarFlair from "discourse/ui-kit/d-user-avatar-flair";
import DUserLink from "discourse/ui-kit/d-user-link";
import dAgeWithTooltip from "discourse/ui-kit/helpers/d-age-with-tooltip";
import dAvatar from "discourse/ui-kit/helpers/d-avatar";

class RpnMobileCategoryAvatars extends Component {
  @tracked rows = [];

  // There is no outlet inside the native mobile featured-topic row. Mount only
  // our avatar and metadata beside its content, preserving core's title,
  // status, unread badges, and muted-list visibility.
  watchRows = modifier((element, [topics]) => {
    const table = element.closest("table");
    if (!table) {
      return;
    }

    const topicsById = new Map(
      (topics || []).map((topic) => [String(topic.id), topic])
    );
    let scheduled;

    const refresh = () => {
      scheduled = null;
      const rows = [];

      for (const row of table.querySelectorAll(
        ":scope > tbody > tr.category-topic-link"
      )) {
        const link = row.querySelector("a[data-topic-id]");
        const topic = topicsById.get(link?.dataset.topicId);
        const target = row.querySelector("td.main-link");
        if (topic && target) {
          rows.push({ topic, target });
        }
      }

      if (
        rows.length !== this.rows.length ||
        rows.some(
          (row, index) =>
            row.topic !== this.rows[index].topic ||
            row.target !== this.rows[index].target
        )
      ) {
        this.rows = rows;
      }
    };

    const queueRefresh = () => {
      scheduled = scheduleOnce("afterRender", refresh);
    };
    const observer = new MutationObserver(queueRefresh);
    observer.observe(table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-topic-id"],
    });
    queueRefresh();

    return () => {
      observer.disconnect();
      if (scheduled) {
        cancel(scheduled);
      }
    };
  });

  <template>
    <td
      hidden
      class="rpn-mobile-category-avatar-anchor"
      {{this.watchRows @outletArgs.category.featuredTopics}}
    ></td>
    {{#each this.rows key="target" as |row|}}
      {{#in-element row.target insertBefore=null}}
        <div class="rpn-mobile-category-topic__poster">
          {{#if row.topic.last_poster}}
            <DUserLink @user={{row.topic.last_poster}}>
              {{dAvatar row.topic.last_poster imageSize="large"}}
            </DUserLink>
            <DUserAvatarFlair @user={{row.topic.last_poster}} />
          {{/if}}
        </div>
        <div class="rpn-mobile-category-topic__meta">
          <a href={{row.topic.lastPostUrl}} class="last-posted-at">
            {{dAgeWithTooltip
              row.topic.last_posted_at
              format="medium-with-ago"
            }}
          </a>
          {{#if row.topic.last_poster}}
            <span aria-hidden="true">·</span>
            <DUserLink @user={{row.topic.last_poster}}>
              {{row.topic.last_poster.username}}
            </DUserLink>
          {{/if}}
        </div>
      {{/in-element}}
    {{/each}}
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet(
    "category-list-after-title-mobile-section",
    RpnMobileCategoryAvatars
  );
});
