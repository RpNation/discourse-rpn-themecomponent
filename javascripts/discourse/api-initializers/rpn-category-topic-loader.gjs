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
const FALLBACK_PAGE_SIZE = 30;

function definitionId(category) {
  return Number(
    category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1]
  );
}

function batchQuery(categories) {
  // Older Discourse versions interpret -topic: as a positive inclusion. Never
  // use it for definition/pin exclusions, even when a newer dev server allows it.
  return [
    `=category:${categories.map((category) => Category.slugFor(category, ":")).join(",")}`,
    "order:activity",
    "status:listed",
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
    this.failed = false;
    this.rateLimited = false;

    const finish = (category) => {
      const latest = candidates.get(category.id);
      category.set("topics", latest ? [latest] : []);
      pending.delete(category.id);
    };

    const topicsFrom = (result) => {
      if (
        !Array.isArray(result?.topic_list?.topics) ||
        result.topic_list.invalid_filters?.length
      ) {
        throw new Error("Invalid category topic response");
      }
      return TopicList.topicsFrom(this.store, result);
    };

    const consider = (category, topic, result) => {
      const poster = topic.posters?.find(
        (entry) => entry.user?.username === topic.last_poster_username
      )?.user;
      const user = result.users?.find(
        (entry) => entry.username === topic.last_poster_username
      );
      topic.set("last_poster", poster || (user && User.create(user)) || null);
      const latest = candidates.get(category.id);
      if (
        !latest ||
        new Date(topic.bumped_at) > new Date(latest.bumped_at) ||
        (topic.bumped_at === latest.bumped_at && topic.id > latest.id)
      ) {
        candidates.set(category.id, topic);
      }
    };

    const resolvePinnedCategory = async (category) => {
      const seen = new Set();
      for (let page = 0; active; page++) {
        // Core's native list falls back to bumped_at DESC for this order, while
        // its pin promotion applies only to "activity"/"default". This narrow
        // compatibility fallback is covered against both beta and current core.
        const result = await categoryTopicRequests.request(
          {
            category: category.id,
            no_subcategories: true,
            order: "bumped_at",
            ascending: false,
            status: "listed",
            per_page: FALLBACK_PAGE_SIZE,
            page,
          },
          { signal: controller.signal, path: "/latest.json" }
        );
        if (!active) {
          return;
        }
        const topics = topicsFrom(result);
        const eligible = topics.filter(
          (topic) =>
            topic.category_id === category.id &&
            topic.id !== definitionId(category)
        );
        if (topics.length && !topics.some((topic) => !seen.has(topic.id))) {
          throw new Error("Category topic pagination did not advance");
        }
        topics.forEach((topic) => seen.add(topic.id));

        if (eligible.length) {
          // Category-scoped lists relax category muting. Recheck these IDs with
          // the same filter as the batch before displaying them. Positive topic
          // filters work on both versions and also avoid global pin promotion.
          const ids = new Set(eligible.map((topic) => topic.id));
          const checked = await categoryTopicRequests.request(
            `${batchQuery([category])} topic:${[...ids].join(",")}`,
            { signal: controller.signal }
          );
          if (!active) {
            return;
          }
          const valid = topicsFrom(checked).filter(
            (topic) => topic.category_id === category.id && ids.has(topic.id)
          );
          if (valid.length) {
            valid.forEach((topic) => consider(category, topic, checked));
            finish(category);
            return;
          }
        }
        if (topics.length < FALLBACK_PAGE_SIZE) {
          finish(category);
          return;
        }
      }
    };

    const loadBatches = async () => {
      try {
        while (active && pending.size) {
          const batch = [];
          for (const category of pending.values()) {
            const next = [...batch, category];
            if (
              encodeURIComponent(batchQuery(next)).length > MAX_QUERY_LENGTH
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
            batchQuery(batch),
            { signal: controller.signal }
          );
          if (!active) {
            return;
          }
          const topics = topicsFrom(result);
          if (!topics.length) {
            batch.forEach(finish);
            continue;
          }

          const batchCategories = new Map(
            batch.map((category) => [category.id, category])
          );
          const complete = new Set();
          let unresolvedCategory;
          for (const topic of topics) {
            const category = batchCategories.get(topic.category_id);
            if (!category) {
              continue;
            }
            unresolvedCategory ||= category;
            if (topic.id === definitionId(category)) {
              continue;
            }

            consider(category, topic, result);

            if (!topic.pinned_globally) {
              complete.add(category.id);
            }
          }

          // An ordinary topic establishes that category's latest activity.
          // Global pins alone do not; resolve them with a pin-neutral list if
          // this batch cannot finish any category.
          // Dropping completed categories prevents busy rows from filling every
          // subsequent response and starving quieter categories.
          for (const id of complete) {
            finish(batchCategories.get(id));
          }
          if (!complete.size) {
            if (!unresolvedCategory) {
              throw new Error("Category topic filter did not advance");
            }
            await resolvePinnedCategory(unresolvedCategory);
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
