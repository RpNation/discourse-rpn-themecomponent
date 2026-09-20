import Component from "@glimmer/component";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import icon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

class WhisperBanner extends Component {
  @service site;

  get audience() {
    const groups = this.site.whispers_allowed_groups_names;
    return groups?.length
      ? i18n(themePrefix("whisper_banner.audience"), {
          groups: groups.join(", "),
        })
      : i18n(themePrefix("whisper_banner.private_discussion"));
  }

  <template>
    {{#if @outletArgs.post.isWhisper}}
      <div class="rpn-whisper-banner" role="note">
        {{icon "far-eye-slash"}}
        <div class="rpn-whisper-banner__text">
          <strong class="rpn-whisper-banner__title">
            {{i18n (themePrefix "whisper_banner.title")}}
          </strong>
          <span class="rpn-whisper-banner__audience">{{this.audience}}</span>
        </div>
      </div>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  api.renderBeforeWrapperOutlet("post-content-cooked-html", WhisperBanner);
});
