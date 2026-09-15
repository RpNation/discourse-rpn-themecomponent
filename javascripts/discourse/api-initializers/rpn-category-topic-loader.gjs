import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { get } from "@ember/object";
import { modifier } from "ember-modifier";
import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import Topic from "discourse/models/topic";
import User from "discourse/models/user";
import DButton from "discourse/ui-kit/d-button";
import { i18n } from "discourse-i18n";
import {
  categoryDefinitionId as definitionId,
  resolvedCategoryPreview,
  setCategoryPreview,
} from "../lib/rpn-category-preview";
import { categoryTopicRequests } from "../lib/rpn-category-topic-requests";

const MAX_BATCH_SIZE = 20;
const MAX_QUERY_LENGTH = 6000;
const FALLBACK_PAGE_SIZE = 30;

function batchQuery(categories) {
  // Older Discourse versions interpret -topic: as a positive inclusion. Never
  // use it for definition/pin exclusions, even when a newer dev server allows it.
  return [
    `category:${categories.map((category) => Category.slugFor(category, ":")).join(",")}`,
    "order:activity",
    "status:listed",
  ].join(" ");
}

// Native previews are selected before rendering. Only ambiguous rows reach this
// loader, and each receives one final result tied to its original native array.
// The shared scheduler holds timing/cooldown information, never topic data.
class RpnCategoryTopicLoader extends Component {
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

    const pending = new Map();
    const sources = new Map();
    const scopeIds = new Map();
    const responseCategories = new Map();
    // Observe native list/source changes, but not our own completed results:
    // publishing one row must not abort and restart the remaining requests.
    const snapshot = (categories || []).map((category) => ({
      category,
      source: get(category, "topics"),
    }));
    const candidates = new Map();
    this.failed = false;
    this.rateLimited = false;

    const finish = (category) => {
      const latest = candidates.get(category.id);
      // Never hydrate these candidates through the shared topic store: a later
      // response for another row could mutate an already-visible author/avatar.
      const topic = latest
        ? Topic.create({
            ...latest.topic,
            last_poster: latest.poster ? User.create(latest.poster) : null,
          })
        : null;
      setCategoryPreview(category, topic, sources.get(category.id));
      pending.delete(category.id);
    };

    const topicsFrom = (result) => {
      if (
        !Array.isArray(result?.topic_list?.topics) ||
        result.topic_list.invalid_filters?.length
      ) {
        throw new Error("Invalid category topic response");
      }
      for (const category of result.topic_list.categories || []) {
        responseCategories.set(category.id, category);
      }
      return result.topic_list.topics;
    };

    const inScope = (category, topic) => {
      const seen = new Set();
      let id = topic.category_id;
      while (id && !seen.has(id)) {
        if (scopeIds.get(category.id).has(id)) {
          return true;
        }
        seen.add(id);
        id = (responseCategories.get(id) || Category.findById(id))
          ?.parent_category_id;
      }
      return false;
    };

    const eligible = (category, topic) =>
      inScope(category, topic) &&
      topic.visible !== false &&
      Number.isFinite(Date.parse(topic.bumped_at)) &&
      topic.id !== definitionId(category) &&
      topic.id !==
        definitionId(
          responseCategories.get(topic.category_id) ||
            Category.findById(topic.category_id) ||
            {}
        );

    const consider = (category, topic, result) => {
      const latest = candidates.get(category.id);
      if (
        !latest ||
        Date.parse(topic.bumped_at) > Date.parse(latest.topic.bumped_at) ||
        (Date.parse(topic.bumped_at) === Date.parse(latest.topic.bumped_at) &&
          topic.id > latest.topic.id)
      ) {
        candidates.set(category.id, {
          topic,
          poster:
            result.users?.find(
              (entry) => entry.username === topic.last_poster_username
            ) || topic.last_poster,
        });
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
            no_subcategories: false,
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
        const scoped = topics.filter((topic) => eligible(category, topic));
        if (topics.length && !topics.some((topic) => !seen.has(topic.id))) {
          throw new Error("Category topic pagination did not advance");
        }
        topics.forEach((topic) => seen.add(topic.id));

        if (scoped.length) {
          // Category-scoped lists relax category muting. Recheck these IDs with
          // the same filter as the batch before displaying them. Positive topic
          // filters work on both versions and also avoid global pin promotion.
          const ids = new Set(scoped.map((topic) => topic.id));
          const checked = await categoryTopicRequests.request(
            `${batchQuery([category])} topic:${[...ids].join(",")}`,
            { signal: controller.signal }
          );
          if (!active) {
            return;
          }
          const valid = topicsFrom(checked).filter(
            (topic) => eligible(category, topic) && ids.has(topic.id)
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
      // Resolve supplemental state outside the modifier's tracking frame. The
      // explicit native snapshot above is the only data that can restart it.
      await Promise.resolve();
      try {
        if (!active || attempt !== this.attempt) {
          return;
        }
        for (const { category, source } of snapshot) {
          if (
            category.topics === source &&
            !resolvedCategoryPreview(category).complete
          ) {
            pending.set(category.id, category);
            sources.set(category.id, source);
            scopeIds.set(
              category.id,
              new Set([
                category.id,
                ...(category.descendants || []).map((child) => child.id),
                ...(category.subcategory_ids || []),
                ...(category.subcategory_list || []).map((child) => child.id),
              ])
            );
          }
        }
        while (active && pending.size) {
          // A fresh native payload supersedes this run, including requests that
          // were already in flight when the category model changed.
          for (const category of pending.values()) {
            if (category.topics !== sources.get(category.id)) {
              pending.delete(category.id);
            }
          }
          if (!pending.size) {
            break;
          }
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
            // Parent and child rows may legitimately share the same topic.
            for (const category of batch) {
              if (!inScope(category, topic)) {
                continue;
              }
              unresolvedCategory ||= category;
              if (!eligible(category, topic)) {
                continue;
              }

              consider(category, topic, result);

              if (!topic.pinned_globally) {
                complete.add(category.id);
              }
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
