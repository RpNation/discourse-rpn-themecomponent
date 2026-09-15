import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { registerDestructor } from "@ember/destroyable";
import { hash } from "@ember/helper";
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
import ComboBox from "discourse/select-kit/components/combo-box";
import { selectKitOptions } from "discourse/select-kit/components/select-kit";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

@selectKitOptions({ headerAriaLabel: null })
class PaletteComboBox extends ComboBox {}

class RpnPaletteSelector extends Component {
  @service site;
  @service session;
  @service interfaceColor;

  @tracked saving = false;
  @tracked failed = false;
  @tracked selectedBaseIsDark;
  @tracked selectedDarkAvailable;
  @tracked selectedLightId;
  @tracked selectedDarkId;

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
    return this.selectedLightId ?? this.selectedId(false);
  }

  get darkId() {
    return this.selectedDarkId ?? this.selectedId(true);
  }

  get mode() {
    return this.interfaceColor.colorMode || "auto";
  }

  get modes() {
    return ["auto", "light", "dark"].map((id) => ({
      id,
      name: i18n(`sidebar.footer.interface_color_selector.${id}`),
    }));
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
  changeMode(value) {
    if (value === "dark") {
      this.interfaceColor.forceDarkMode();
    } else if (value === "light") {
      this.interfaceColor.forceLightMode();
    } else {
      this.interfaceColor.useAutoMode();
    }
  }

  @action
  changeLight(value) {
    return this.changePalette(value, false);
  }

  @action
  changeDark(value) {
    return this.changePalette(value, true);
  }

  async changePalette(value, dark) {
    const id = Number(value);
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
        this.selectedDarkId = id;
        this.selectedDarkAvailable = true;
      } else {
        this.selectedLightId = id;
        this.selectedBaseIsDark = this.isDarkBasePalette(resolvedId);
      }
      this.applyMode();
    } catch {
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
            <div class="rpn-palette-selector__field">
              <span class="rpn-palette-selector__field-label">{{i18n
                  (themePrefix "palette_selector.light")
                }}</span>
              <PaletteComboBox
                class="rpn-palette-selector__light"
                @content={{this.lightPalettes}}
                @value={{this.lightId}}
                @onChange={{this.changeLight}}
                @options={{hash
                  disabled=this.saving
                  mobilePlacementStrategy="fixed"
                  headerAriaLabel=(i18n (themePrefix "palette_selector.light"))
                }}
              />
            </div>
            <div class="rpn-palette-selector__field">
              <span class="rpn-palette-selector__field-label">{{i18n
                  (themePrefix "palette_selector.dark")
                }}</span>
              <PaletteComboBox
                class="rpn-palette-selector__dark"
                @content={{this.darkPalettes}}
                @value={{this.darkId}}
                @onChange={{this.changeDark}}
                @options={{hash
                  disabled=this.saving
                  mobilePlacementStrategy="fixed"
                  headerAriaLabel=(i18n (themePrefix "palette_selector.dark"))
                }}
              />
            </div>
            {{#if this.modeAvailable}}
              <div class="rpn-palette-selector__field">
                <span class="rpn-palette-selector__field-label">{{i18n
                    (themePrefix "palette_selector.mode")
                  }}</span>
                <PaletteComboBox
                  class="rpn-palette-selector__mode"
                  @content={{this.modes}}
                  @value={{this.mode}}
                  @onChange={{this.changeMode}}
                  @options={{hash
                    disabled=this.saving
                    mobilePlacementStrategy="fixed"
                    headerAriaLabel=(i18n (themePrefix "palette_selector.mode"))
                  }}
                />
              </div>
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
