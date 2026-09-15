import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { registerDestructor } from "@ember/destroyable";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DMenu from "discourse/float-kit/components/d-menu";
import { ajax } from "discourse/lib/ajax";
import { apiInitializer } from "discourse/lib/api";
import {
  listColorSchemes,
  updateColorSchemeCookie,
} from "discourse/lib/color-scheme-picker";
import cookie from "discourse/lib/cookie";
import { currentThemeId, listThemes } from "discourse/lib/theme-selector";
import { eq } from "discourse/truth-helpers";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

class RpnPaletteSelector extends Component {
  @service site;
  @service session;
  @service interfaceColor;

  @tracked saving = false;
  @tracked failed = false;
  @tracked selectedBaseIsDark;
  @tracked selectedDarkAvailable;

  constructor() {
    super(...arguments);
    registerDestructor(this, () => {
      this.paletteRequest?.abort();
      this.cancelStylesheet?.();
    });
  }

  get currentTheme() {
    return listThemes(this.site)?.find(
      (theme) => theme.id === currentThemeId()
    );
  }

  get lightPalettes() {
    return (
      listColorSchemes(this.site, { currentTheme: this.currentTheme }) || []
    ).filter((palette) => !palette.is_dark);
  }

  get darkPalettes() {
    return (
      listColorSchemes(this.site, {
        currentTheme: this.currentTheme,
        darkOnly: true,
      }) || []
    );
  }

  get available() {
    return this.lightPalettes.length > 1 || this.darkPalettes.length > 1;
  }

  get lightId() {
    return this.selectedId(false);
  }

  get darkId() {
    return this.selectedId(true);
  }

  get mode() {
    return this.interfaceColor.colorMode || "auto";
  }

  get modeAvailable() {
    return (
      (this.selectedDarkAvailable ?? this.session.darkModeAvailable) &&
      !(this.selectedBaseIsDark ?? this.session.defaultColorSchemeIsDark)
    );
  }

  selectedId(dark) {
    const stored = cookie(dark ? "dark_scheme_id" : "color_scheme_id");
    const id = stored
      ? Number(stored)
      : dark
        ? this.session.userDarkSchemeId
        : this.session.userColorSchemeId;
    const palettes = dark ? this.darkPalettes : this.lightPalettes;
    return palettes.some((palette) => palette.id === id) ? id : -1;
  }

  isDarkBasePalette(id) {
    const palette = this.site.user_color_schemes?.find(
      (entry) => entry.id === id
    );
    const defaultPalette = this.site.default_light_color_scheme;
    return Boolean(
      palette?.is_dark ??
      (defaultPalette?.id === id ? defaultPalette.is_dark : false)
    );
  }

  @action
  changeMode(event) {
    if (event.target.value === "dark") {
      this.interfaceColor.forceDarkMode();
    } else if (event.target.value === "light") {
      this.interfaceColor.forceLightMode();
    } else {
      this.interfaceColor.useAutoMode();
    }
  }

  @action
  changeLight(event) {
    return this.changePalette(event, false);
  }

  @action
  changeDark(event) {
    return this.changePalette(event, true);
  }

  async changePalette(event, dark) {
    const id = Number(event.target.value);
    const previous = dark ? this.darkId : this.lightId;
    const palettes = dark ? this.darkPalettes : this.lightPalettes;
    if (this.saving || !palettes.some((palette) => palette.id === id)) {
      return;
    }
    this.saving = true;
    this.failed = false;

    try {
      const resolvedId =
        id === -1
          ? (dark
              ? this.currentTheme?.dark_color_scheme_id
              : this.currentTheme?.color_scheme_id) || -1
          : id;
      const themeId = currentThemeId();
      const suffix = themeId === undefined ? "" : `/${themeId}`;
      this.paletteRequest = ajax(
        `/color-scheme-stylesheet/${resolvedId}${suffix}.json`,
        { ignoreUnsent: false, timeout: 15000 }
      );
      const result = await this.paletteRequest;
      if (this.isDestroying || this.isDestroyed) {
        return;
      }
      if (!result?.new_href) {
        throw new Error("Missing palette stylesheet");
      }
      await this.replaceStylesheet(result.new_href, dark, resolvedId);
      updateColorSchemeCookie(id, { dark });
      this.session.set(dark ? "userDarkSchemeId" : "userColorSchemeId", id);
      this.session.set(
        dark ? "darkModeAvailable" : "defaultColorSchemeIsDark",
        dark || this.isDarkBasePalette(resolvedId)
      );
      if (dark) {
        this.selectedDarkAvailable = true;
      } else {
        this.selectedBaseIsDark = this.isDarkBasePalette(resolvedId);
      }
      this.applyMode();
    } catch {
      event.target.value = String(previous);
      if (!this.isDestroying && !this.isDestroyed) {
        this.failed = true;
      }
    } finally {
      this.paletteRequest = null;
      if (!this.isDestroying && !this.isDestroyed) {
        this.saving = false;
      }
    }
  }

  applyMode() {
    if (this.mode === "dark") {
      this.interfaceColor.forceDarkMode();
    } else if (this.mode === "light") {
      this.interfaceColor.forceLightMode();
    } else {
      this.interfaceColor.useAutoMode();
    }
  }

  replaceStylesheet(href, dark, id) {
    const className = dark ? "dark-scheme" : "light-scheme";
    const existing = document.querySelector(`link.${className}`);
    const pending = document.createElement("link");
    pending.rel = "stylesheet";
    pending.href = href;
    pending.media = "not all";

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        pending.onload = null;
        pending.onerror = null;
        this.cancelStylesheet = null;
        if (error) {
          pending.remove();
          reject(error);
        } else {
          resolve();
        }
      };
      const timer = window.setTimeout(() => {
        finish(new Error("Palette stylesheet timed out"));
      }, 15000);
      this.cancelStylesheet = () =>
        finish(new Error("Palette selector closed"));
      pending.onerror = () => {
        finish(new Error("Palette stylesheet failed to load"));
      };
      pending.onload = () => {
        if (settled || this.isDestroying || this.isDestroyed) {
          finish(new Error("Palette selector closed"));
          return;
        }
        pending.className = className;
        pending.dataset.schemeId = String(id);
        pending.media = existing?.media || (dark ? "none" : "all");
        existing?.remove();
        finish();
      };
      // Keep the palette in the same cascade position as Discourse's native CSS.
      if (existing) {
        existing.after(pending);
      } else {
        document.head.appendChild(pending);
      }
    });
  }

  <template>
    {{#if this.available}}
      <DMenu
        class="rpn-palette-selector"
        @identifier="rpn-palette-selector"
        @placementStrategy="fixed"
        @modalForMobile={{true}}
        @triggerClass="rpn-palette-selector__trigger btn-flat"
        @ariaLabel={{i18n (themePrefix "palette_selector.title")}}
      >
        <:trigger>
          <span class="rpn-palette-selector__label">{{i18n
              (themePrefix "palette_selector.title")
            }}</span>
          <span
            class="rpn-palette-selector__indicator"
            aria-hidden="true"
          >{{dIcon "chevron-up"}}</span>
        </:trigger>
        <:content>
          <div class="rpn-palette-selector__panel">
            <label>
              <span>{{i18n (themePrefix "palette_selector.light")}}</span>
              <select
                class="rpn-palette-selector__light"
                disabled={{this.saving}}
                {{on "change" this.changeLight}}
              >
                {{#each this.lightPalettes as |palette|}}
                  <option
                    value={{palette.id}}
                    selected={{eq palette.id this.lightId}}
                  >{{palette.name}}</option>
                {{/each}}
              </select>
            </label>
            <label>
              <span>{{i18n (themePrefix "palette_selector.dark")}}</span>
              <select
                class="rpn-palette-selector__dark"
                disabled={{this.saving}}
                {{on "change" this.changeDark}}
              >
                {{#each this.darkPalettes as |palette|}}
                  <option
                    value={{palette.id}}
                    selected={{eq palette.id this.darkId}}
                  >{{palette.name}}</option>
                {{/each}}
              </select>
            </label>
            {{#if this.modeAvailable}}
              <label>
                <span>{{i18n (themePrefix "palette_selector.mode")}}</span>
                <select
                  class="rpn-palette-selector__mode"
                  disabled={{this.saving}}
                  {{on "change" this.changeMode}}
                >
                  <option value="auto" selected={{eq this.mode "auto"}}>{{i18n
                      "sidebar.footer.interface_color_selector.auto"
                    }}</option>
                  <option value="light" selected={{eq this.mode "light"}}>{{i18n
                      "sidebar.footer.interface_color_selector.light"
                    }}</option>
                  <option value="dark" selected={{eq this.mode "dark"}}>{{i18n
                      "sidebar.footer.interface_color_selector.dark"
                    }}</option>
                </select>
              </label>
            {{/if}}
            {{#if this.failed}}
              <p class="rpn-palette-selector__error" role="alert">{{i18n
                  (themePrefix "palette_selector.error")
                }}</p>
            {{/if}}
          </div>
        </:content>
      </DMenu>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  // The picker is portaled outside the mobile sidebar. Keep taps inside it
  // from closing the sidebar and destroying the picker before pointerup.
  api.registerValueTransformer(
    "hamburger-dropdown-click-outside-exceptions",
    ({ value }) => [...value, '[data-identifier="rpn-palette-selector"]']
  );

  api.renderInOutlet("sidebar-footer-actions", RpnPaletteSelector);
});
