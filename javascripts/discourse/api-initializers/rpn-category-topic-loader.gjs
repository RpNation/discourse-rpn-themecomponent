import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { ajax } from "discourse/lib/ajax";
import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import TopicList from "discourse/models/topic-list";
import User from "discourse/models/user";
import DButton from "discourse/ui-kit/d-button";
import { i18n } from "discourse-i18n";

// Keep requests scoped to this mounted list. Never retain responses across users
// or page visits, and avoid a burst of requests on sites with many categories.
class RpnCategoryTopicLoader extends Component {
  @service store;

  @tracked failed = false;

  @tracked attempt = 0;

  retry = () => {
    this.attempt++;
  };

  load = modifier((element, [categories, showTopics, attempt]) => {
    if (!showTopics) {
      return;
    }

    let active = true;
    const queue = [];
    const seen = new Set();
    // These are the actual rows rendered by CategoriesOnly. Nested categories
    // render as badges or SubCategoryRow, neither of which shows topic previews.
    for (const category of categories || []) {
      if (seen.has(category.id)) {
        continue;
      }
      seen.add(category.id);
      queue.push(category);
      if (!attempt) {
        category.set("topics", []);
      }
    }
    this.failed = false;

    const worker = async () => {
      while (active && queue.length) {
        const category = queue.shift();
        // Exact category, newest activity first: pins receive no special rank.
        // The definition topic is excluded even when site settings show it in
        // ordinary topic lists. The endpoint enforces permissions and muting.
        const query = [
          `=category:${Category.slugFor(category, ":")}`,
          "order:activity",
          "status:listed",
        ];
        const definitionId =
          category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1];
        if (definitionId) {
          query.push(`-topic:${definitionId}`);
        }
        try {
          let latest;
          const excluded = [];
          while (active) {
            const result = await ajax("/filter.json", {
              ignoreUnsent: false,
              timeout: 15000,
              data: {
                q: [
                  ...query,
                  ...(excluded.length ? [`-topic:${excluded.join(",")}`] : []),
                ].join(" "),
              },
            });
            if (!active) {
              return;
            }
            const topics = TopicList.topicsFrom(this.store, result);
            for (const topic of topics) {
              const poster = topic.posters?.find(
                (entry) => entry.user?.username === topic.last_poster_username
              )?.user;
              const user = result.users?.find(
                (entry) => entry.username === topic.last_poster_username
              );
              topic.set(
                "last_poster",
                poster || (user && User.create(user)) || null
              );
              if (
                !latest ||
                new Date(topic.bumped_at) > new Date(latest.bumped_at) ||
                (topic.bumped_at === latest.bumped_at && topic.id > latest.id)
              ) {
                latest = topic;
              }
            }
            // Core still promotes GLOBAL pins in filter responses. A page with
            // any ordinary/local-pin topic contains the newest such topic and
            // all remaining global pins. If globals fill the entire page,
            // exclude those seen and continue instead of trusting that page.
            if (
              !topics.length ||
              topics.some((topic) => !topic.pinned_globally)
            ) {
              break;
            }
            const unseen = topics.filter(
              (topic) => !excluded.includes(topic.id)
            );
            if (!unseen.length) {
              throw new Error("Category topic filter did not advance");
            }
            excluded.push(...unseen.map((topic) => topic.id));
          }
          if (active) {
            category.set("topics", latest ? [latest] : []);
          }
        } catch {
          if (active) {
            this.failed = true;
          }
        }
      }
    };
    const workerCount = Math.min(3, queue.length);
    for (let index = 0; index < workerCount; index++) {
      worker();
    }
    return () => {
      active = false;
    };
  });

  <template>
    <div
      class="rpn-category-topic-loader"
      {{this.load @outletArgs.categories @outletArgs.showTopics this.attempt}}
    >
      {{#if this.failed}}
        <span role="status">{{i18n
            (themePrefix "latest_activity_load_error")
          }}</span>
        <DButton
          @label={{themePrefix "latest_activity_retry"}}
          @action={{this.retry}}
        />
      {{/if}}
    </div>
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("below-categories-only", RpnCategoryTopicLoader);
});
