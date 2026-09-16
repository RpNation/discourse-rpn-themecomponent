import { trustHTML } from "@ember/template";
import TopicPostBadges from "discourse/components/topic-post-badges";
import TopicStatus from "discourse/components/topic-status";
import DUserAvatarFlair from "discourse/ui-kit/d-user-avatar-flair";
import DUserLink from "discourse/ui-kit/d-user-link";
import dAgeWithTooltip from "discourse/ui-kit/helpers/d-age-with-tooltip";
import dAvatar from "discourse/ui-kit/helpers/d-avatar";

const RpnFeaturedTopic = <template>
  <div data-topic-id={{@topic.id}} class="featured-topic rpn-featured-topic">
    <div class="rpn-featured-topic__poster">
      {{#if @topic.last_poster}}
        <DUserLink @user={{@topic.last_poster}}>
          {{dAvatar @topic.last_poster imageSize="large"}}
        </DUserLink>
        <DUserAvatarFlair @user={{@topic.last_poster}} />
      {{/if}}
    </div>
    <div class="rpn-featured-topic__content">
      <TopicStatus @topic={{@topic}} @context="topic-list" />
      <a href={{@topic.lastUnreadUrl}} class="title">{{trustHTML
          @topic.fancyTitle
        }}</a>
      <TopicPostBadges
        @unreadPosts={{@topic.unread_posts}}
        @unseen={{@topic.unseen}}
        @url={{@topic.lastUnreadUrl}}
      />
    </div>
    <div class="rpn-featured-topic__meta">
      <a href={{@topic.lastPostUrl}} class="last-posted-at">
        {{dAgeWithTooltip @topic.last_posted_at format="medium-with-ago"}}
      </a>
      {{#if @topic.last_poster}}
        <span aria-hidden="true">·</span>
        <DUserLink
          @user={{@topic.last_poster}}
        >{{@topic.last_poster.username}}</DUserLink>
      {{/if}}
    </div>
  </div>
</template>;

export default RpnFeaturedTopic;
