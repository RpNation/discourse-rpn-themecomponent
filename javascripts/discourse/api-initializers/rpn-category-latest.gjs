import { trustHTML } from "@ember/template";
import PluginOutlet from "discourse/components/plugin-outlet";
import TopicPostBadges from "discourse/components/topic-post-badges";
import TopicStatus from "discourse/components/topic-status";
import lazyHash from "discourse/helpers/lazy-hash";
import { apiInitializer } from "discourse/lib/api";
import DUserAvatarFlair from "discourse/ui-kit/d-user-avatar-flair";
import DUserLink from "discourse/ui-kit/d-user-link";
import dAgeWithTooltip from "discourse/ui-kit/helpers/d-age-with-tooltip";
import dAvatar from "discourse/ui-kit/helpers/d-avatar";

const RpnCategoryLatest = <template>
  {{! The outlet does not expose whether the row belongs to the muted list. }}
  {{#if @outletArgs.category.hasMuted}}
    {{yield}}
  {{else if @outletArgs.showTopics}}
    <td class="latest rpn-category-latest">
      {{#each @outletArgs.category.featuredTopics as |topic|}}
        <div
          data-topic-id={{topic.id}}
          class="featured-topic rpn-featured-topic"
        >
          <div class="rpn-featured-topic__poster">
            {{#if topic.last_poster}}
              <DUserLink @user={{topic.last_poster}}>
                {{dAvatar topic.last_poster imageSize="large"}}
              </DUserLink>
              <DUserAvatarFlair @user={{topic.last_poster}} />
            {{/if}}
          </div>

          <div class="rpn-featured-topic__content">
            <TopicStatus @topic={{topic}} @context="topic-list" />
            <a href={{topic.lastUnreadUrl}} class="title">
              {{trustHTML topic.fancyTitle}}
            </a>
            <TopicPostBadges
              @unreadPosts={{topic.unread_posts}}
              @unseen={{topic.unseen}}
              @url={{topic.lastUnreadUrl}}
            />
          </div>

          <a href={{topic.lastPostUrl}} class="last-posted-at">
            {{dAgeWithTooltip topic.last_posted_at}}
          </a>
        </div>
      {{/each}}
    </td>
    <PluginOutlet
      @name="category-list-after-latest-section"
      @outletArgs={{lazyHash category=@outletArgs.category}}
    />
  {{/if}}
</template>;

export default apiInitializer((api) => {
  api.renderInOutlet("category-list-latest-wrapper", RpnCategoryLatest);
});
