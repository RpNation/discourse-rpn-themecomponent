import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { apiInitializer } from "discourse/lib/api";
import getURL from "discourse/lib/get-url";
import { wantsNewWindow } from "discourse/lib/intercept-click";
import { applyValueTransformer } from "discourse/lib/transformer";
import DiscourseURL from "discourse/lib/url";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

class RpnHeaderNavigation extends Component {
  get links() {
    if (!Array.isArray(settings.header_links)) {
      return [];
    }

    return settings.header_links
      .filter((link) => typeof link?.label === "string" && link.label.trim())
      .map((link) => ({
        label: link.label.trim(),
        icon: link.icon || "link",
        href: this.resolveURL(link.url),
      }));
  }

  resolveURL(value) {
    const url = typeof value === "string" ? value.trim() : "";
    // Blank or unsupported destinations stay placeholders. Never render an
    // executable URL from a setting, even if it bypasses the admin editor.
    if (!/^\/(?!\/)|^https?:\/\//i.test(url)) {
      return null;
    }

    try {
      const parsed = new URL(url, window.location.origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
    } catch {
      return null;
    }

    return url === "/"
      ? applyValueTransformer("home-logo-href", getURL(url))
      : getURL(url);
  }

  @action
  navigate(event) {
    if (
      wantsNewWindow(event) ||
      event.currentTarget.origin !== window.location.origin
    ) {
      return;
    }

    event.preventDefault();
    DiscourseURL.routeToTag(event.currentTarget);
  }

  <template>
    {{#if this.links.length}}
      <nav
        class="rpn-header-navigation"
        aria-label={{i18n (themePrefix "header_navigation.label")}}
      >
        {{#each this.links as |link|}}
          {{#if link.href}}
            <a
              class="rpn-header-navigation__item"
              href={{link.href}}
              aria-label={{link.label}}
              title={{link.label}}
              {{on "click" this.navigate}}
            >
              {{dIcon link.icon}}
              <span class="rpn-header-navigation__label">{{link.label}}</span>
            </a>
          {{else}}
            <button
              type="button"
              class="rpn-header-navigation__item"
              aria-label={{link.label}}
              title={{i18n
                (themePrefix "header_navigation.coming_soon")
                label=link.label
              }}
              disabled
            >
              {{dIcon link.icon}}
              <span class="rpn-header-navigation__label">{{link.label}}</span>
            </button>
          {{/if}}
        {{/each}}
      </nav>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("before-header-panel", RpnHeaderNavigation);
});
