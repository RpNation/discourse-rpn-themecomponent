import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";

const STORAGE_KEY = "rpn-full-width";

class WidthPreference {
  @tracked enabled = false;

  apply(enabled) {
    this.enabled = enabled;
    document.documentElement.classList.toggle(STORAGE_KEY, enabled);
  }

  restore() {
    try {
      this.apply(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      this.apply(false);
    }
  }

  toggle() {
    this.apply(!this.enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(this.enabled));
    } catch {
      // The current session still works when browser storage is unavailable.
    }
  }
}

const preference = new WidthPreference();

class RpnWidthToggle extends Component {
  preference = preference;

  get pressed() {
    return String(this.preference.enabled);
  }

  @action
  toggle() {
    this.preference.toggle();
  }

  <template>
    <button
      type="button"
      class="rpn-width-toggle"
      aria-pressed={{this.pressed}}
      {{on "click" this.toggle}}
    >
      <span>{{i18n (themePrefix "full_width_toggle")}}</span>
      <span class="rpn-width-toggle__track" aria-hidden="true">
        <span class="rpn-width-toggle__thumb"></span>
      </span>
    </button>
  </template>
}

export default apiInitializer((api) => {
  preference.restore();
  api.renderInOutlet("sidebar-footer-actions", RpnWidthToggle);
});
