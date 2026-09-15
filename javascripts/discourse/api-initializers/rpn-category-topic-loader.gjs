import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import TopicList from "discourse/models/topic-list";
import User from "discourse/models/user";
import DButton from "discourse/ui-kit/d-button";
import { i18n } from "discourse-i18n";
import { categoryTopicRequests } from "../lib/rpn-category-topic-requests";

const MAX_BATCH_SIZE = 20;
const MAX_QUERY_LENGTH = 6000;

function definitionId(category) {
  return Number(
    category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1]
  );
}

function batchQuery(categories, seenPins) {
  const excluded = new Set();
  for (const category of categories) {
    const definition = definitionId(category);
    if (definition) {
      excluded.add(definition);
    }
    for (const id of seenPins.get(category.id) || []) {
      excluded.add(id);
    }
  }

  return [
    `=category:${categories.map((category) => Category.slugFor(category, ":")).join(",")}`,
    "order:activity",
    "status:listed",
    ...(excluded.size ? [`-topic:${[...excluded].join(",")}`] : []),
  ].join(" ");
}

// Results belong only to this mounted list. The shared request scheduler holds
// timing/cooldown information, never topic data or user-specific responses.
class RpnCategoryTopicLoader extends Component {
  @service store;

  @tracked failed = false;
  @tracked rateLimited = false;

  @tracked attempt = 0;

  retry = () => {
    if (!this.rateLimited) {
      this.attempt++;
    }
  };

  load = modifier((element, [categories, showTopics, attempt]) => {
    if (!showTopics) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    let cooldownTimer;

    // Retain completed rows on Retry, but never reuse results on a new list.
    if (!attempt || this.categories !== categories) {
      this.categories = categories;
      this.pending = new Map();
      for (const category of categories || []) {
        category.set("topics", []);
        // Topic counts exclude the category definition. Empty rows need no API
        // request; undefined counts still require a lookup.
        if (category.topic_count !== 0) {
          this.pending.set(category.id, category);
        }
      }
    }
    const pending = this.pending;
    const candidates = new Map();
    const seenPins = new Map();
    this.failed = false;
    this.rateLimited = false;

    const finish = (category) => {
      const latest = candidates.get(category.id);
      category.set("topics", latest ? [latest] : []);
      pending.delete(category.id);
    };

    const loadBatches = async () => {
      try {
        while (active && pending.size) {
          const batch = [];
          for (const category of pending.values()) {
            const next = [...batch, category];
            if (
              encodeURIComponent(batchQuery(next, seenPins)).length >
              MAX_QUERY_LENGTH
            ) {
              if (!batch.length) {
                throw new Error("Category topic query is too long");
              }
              break;
            }
            batch.push(category);
            if (batch.length === MAX_BATCH_SIZE) {
              break;
            }
          }

          const result = await categoryTopicRequests.request(
            batchQuery(batch, seenPins),
            { signal: controller.signal }
          );
          if (!active) {
            return;
          }
          if (!Array.isArray(result?.topic_list?.topics)) {
            throw new Error("Invalid category topic response");
          }
          const topics = TopicList.topicsFrom(this.store, result);
          if (!topics.length) {
            batch.forEach(finish);
            continue;
          }

          const batchCategories = new Map(
            batch.map((category) => [category.id, category])
          );
          const complete = new Set();
          let newPins = false;
          for (const topic of topics) {
            const category = batchCategories.get(topic.category_id);
            if (!category || topic.id === definitionId(category)) {
              continue;
            }
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
            const latest = candidates.get(category.id);
            if (
              !latest ||
              new Date(topic.bumped_at) > new Date(latest.bumped_at) ||
              (topic.bumped_at === latest.bumped_at && topic.id > latest.id)
            ) {
              candidates.set(category.id, topic);
            }

            if (!topic.pinned_globally) {
              complete.add(category.id);
            } else {
              let pins = seenPins.get(category.id);
              if (!pins) {
                pins = new Set();
                seenPins.set(category.id, pins);
              }
              newPins ||= !pins.has(topic.id);
              pins.add(topic.id);
            }
          }

          // An ordinary topic establishes that category's latest activity.
          // Global pins alone do not: exclude seen pins and continue looking.
          // Dropping completed categories prevents busy rows from filling every
          // subsequent response and starving quieter categories.
          for (const id of complete) {
            finish(batchCategories.get(id));
          }
          if (!complete.size && !newPins) {
            throw new Error("Category topic filter did not advance");
          }
        }
      } catch (error) {
        if (active) {
          // Stop the whole run on failure. In particular, do not keep sending
          // queued requests after nginx/Discourse has told us to slow down.
          this.failed = true;
          if (error.jqXHR?.status === 429) {
            this.rateLimited = true;
            cooldownTimer = window.setTimeout(
              () => {
                if (active) {
                  this.rateLimited = false;
                }
              },
              Math.max(0, categoryTopicRequests.blockedUntil - Date.now())
            );
          }
        }
      }
    };
    loadBatches();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(cooldownTimer);
    };
  });

  <template>
    <div
      class="rpn-category-topic-loader"
      {{this.load @outletArgs.categories @outletArgs.showTopics this.attempt}}
    >
      {{#if this.failed}}
        <span role="status">
          {{#if this.rateLimited}}
            {{i18n (themePrefix "latest_activity_rate_limited")}}
          {{else}}
            {{i18n (themePrefix "latest_activity_load_error")}}
          {{/if}}
        </span>
        <DButton
          @label={{themePrefix "latest_activity_retry"}}
          @action={{this.retry}}
          @disabled={{this.rateLimited}}
        />
      {{/if}}
    </div>
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("below-categories-only", RpnCategoryTopicLoader);
});
