import {
  click,
  find,
  settled,
  triggerEvent,
  visit,
  waitUntil,
} from "@ember/test-helpers";
import { test } from "qunit";
import cookie, { removeCookie } from "discourse/lib/cookie";
import { currentThemeId } from "discourse/lib/theme-selector";
import Session from "discourse/models/session";
import Site from "discourse/models/site";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

async function choose(selector, value) {
  find(selector).value = value;
  await triggerEvent(selector, "change");
}

const trigger = ".rpn-palette-selector__trigger";

// DMenu renders its modal inline in QUnit. These tests cover touch lifecycle
// and saved choices; portaled popup hit testing also needs a real browser.
acceptance("RPN Foundation | Color palettes | mobile modal", function (needs) {
  needs.mobileView();
  needs.settings({ navigation_menu: "sidebar" });
  needs.site({
    user_color_schemes: [
      { id: 901, name: "Test Light", is_dark: false, colors: [] },
      { id: 902, name: "Test Dark", is_dark: true, colors: [] },
    ],
  });

  let originalPaletteLinks;
  needs.hooks.beforeEach(() => {
    originalPaletteLinks = [
      ...document.querySelectorAll("link.light-scheme, link.dark-scheme"),
    ].map((link) => link.cloneNode());
  });
  needs.hooks.afterEach(() => {
    document
      .querySelectorAll("link.light-scheme, link.dark-scheme")
      .forEach((link) => link.remove());
    for (const link of originalPaletteLinks) {
      document.head.appendChild(link);
    }
    for (const name of [
      "color_scheme_id",
      "dark_scheme_id",
      "forced_color_mode",
    ]) {
      removeCookie(name, { path: "/" });
    }
  });
  needs.pretender((server, helper) => {
    const stylesheet = () =>
      helper.response({
        new_href: document.querySelector("link[rel=stylesheet]").href,
      });
    server.get("/color-scheme-stylesheet/:id/:theme.json", stylesheet);
    server.get("/color-scheme-stylesheet/:id.json", stylesheet);
  });

  async function touchStart(element) {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
      })
    );
    await settled();
  }

  test("keeps interior touches in the accessible modal while preserving native outside-close", async function (assert) {
    await visit("/latest");
    await click(".hamburger-dropdown button");
    await click(trigger);
    const panel = find(".rpn-palette-selector__panel");
    const dialog = panel.closest('[role="dialog"]');
    const sidebar = find(".hamburger-panel");
    assert.dom(dialog).exists();
    assert.dom(dialog).hasAttribute("aria-modal", "true");
    assert.dom(".rpn-palette-selector__light").exists();

    for (const target of [panel, panel.querySelector("label span")]) {
      await touchStart(target);
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      assert.strictEqual(find(".hamburger-panel"), sidebar);
      assert.true(dialog.isConnected, "the portaled dialog remains mounted");
    }

    await touchStart(find(".header-cloak"));
    assert.dom(".hamburger-panel").doesNotExist();
    assert.dom(".rpn-palette-selector__panel").doesNotExist();
  });

  test("keeps light and dark controls mounted through touch selection and saves palettes and appearance", async function (assert) {
    await visit("/latest");
    Session.current().setProperties({
      darkModeAvailable: true,
      defaultColorSchemeIsDark: false,
      userColorSchemeId: -1,
      userDarkSchemeId: -1,
    });
    await click(".hamburger-dropdown button");
    await click(trigger);
    const panel = find(".rpn-palette-selector__panel");
    const sidebar = find(".hamburger-panel");

    for (const [selector, value, cookieName] of [
      [".rpn-palette-selector__light", "901", "color_scheme_id"],
      [".rpn-palette-selector__dark", "902", "dark_scheme_id"],
      [".rpn-palette-selector__mode", "dark", "forced_color_mode"],
    ]) {
      const control = find(selector);
      await touchStart(control);
      assert.strictEqual(
        find(selector),
        control,
        "pointerdown keeps the control mounted"
      );
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      assert.strictEqual(find(".hamburger-panel"), sidebar);
      await triggerEvent(control, "pointerup", { pointerType: "touch" });
      await choose(selector, value);
      await waitUntil(() => cookie(cookieName) === value);
      assert.dom(selector).hasValue(value).isNotDisabled();
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      assert.strictEqual(find(".hamburger-panel"), sidebar);
    }
    assert.strictEqual(cookie("color_scheme_id"), "901");
    assert.strictEqual(cookie("dark_scheme_id"), "902");
    assert.strictEqual(cookie("forced_color_mode"), "dark");
  });
});

for (const signedIn of [false, true]) {
  acceptance(
    `RPN Foundation | Color palettes | ${signedIn ? "signed in" : "anonymous"}`,
    function (needs) {
      if (signedIn) {
        needs.user();
      }
      needs.settings({ navigation_menu: "sidebar" });
      let loadSuccessfully;
      let originalPaletteLinks;
      needs.site({
        user_color_schemes: [
          { id: 901, name: "Test Light", is_dark: false, colors: [] },
          { id: 902, name: "Test Dark", is_dark: true, colors: [] },
        ],
      });
      needs.hooks.beforeEach(() => {
        loadSuccessfully = false;
        originalPaletteLinks = [
          ...document.querySelectorAll("link.light-scheme, link.dark-scheme"),
        ].map((link) => link.cloneNode());
      });
      needs.hooks.afterEach(() => {
        document
          .querySelectorAll("link.light-scheme, link.dark-scheme")
          .forEach((link) => link.remove());
        for (const link of originalPaletteLinks) {
          document.head.appendChild(link);
        }
        for (const name of [
          "color_scheme_id",
          "dark_scheme_id",
          "forced_color_mode",
        ]) {
          removeCookie(name, { path: "/" });
        }
      });
      needs.pretender((server, helper) => {
        server.get("/color-scheme-stylesheet/:id/:theme.json", () =>
          loadSuccessfully
            ? helper.response({
                new_href: document.querySelector("link[rel=stylesheet]").href,
              })
            : helper.response(500, {})
        );
        server.get("/color-scheme-stylesheet/:id.json", () =>
          loadSuccessfully
            ? helper.response({
                new_href: document.querySelector("link[rel=stylesheet]").href,
              })
            : helper.response(500, {})
        );
      });

      test("offers independent light/dark palettes and preserves their cookies when changing appearance", async function (assert) {
        cookie("color_scheme_id", "901", { path: "/" });
        cookie("dark_scheme_id", "902", { path: "/" });
        await visit("/latest");
        Session.current().setProperties({
          darkModeAvailable: true,
          defaultColorSchemeIsDark: false,
          userColorSchemeId: 901,
          userDarkSchemeId: 902,
        });
        await click(trigger);
        assert.dom('.rpn-palette-selector__light option[value="901"]').exists();
        assert
          .dom('.rpn-palette-selector__light option[value="902"]')
          .doesNotExist();
        assert.dom('.rpn-palette-selector__dark option[value="902"]').exists();
        assert
          .dom('.rpn-palette-selector__dark option[value="901"]')
          .doesNotExist();

        for (const mode of ["dark", "light", "auto"]) {
          await choose(".rpn-palette-selector__mode", mode);
          assert.strictEqual(cookie("forced_color_mode"), mode);
          assert.strictEqual(cookie("color_scheme_id"), "901");
          assert.strictEqual(cookie("dark_scheme_id"), "902");
        }
      });

      test("failed palette loading preserves the saved palette and offers retry", async function (assert) {
        cookie("color_scheme_id", "901", { path: "/" });
        cookie("dark_scheme_id", "902", { path: "/" });
        await visit("/latest");
        Session.current().setProperties({
          darkModeAvailable: true,
          defaultColorSchemeIsDark: false,
          userColorSchemeId: 901,
          userDarkSchemeId: 902,
        });
        await click(trigger);
        await choose(".rpn-palette-selector__light", "-1");
        assert.dom(".rpn-palette-selector__error").exists();
        assert.dom(".rpn-palette-selector__light").hasValue("901");
        assert.dom(".rpn-palette-selector__light").isNotDisabled();
        assert.strictEqual(cookie("color_scheme_id"), "901");
        assert.strictEqual(cookie("dark_scheme_id"), "902");
      });

      test("a dark base default keeps native dark-base mode metadata", async function (assert) {
        loadSuccessfully = true;
        cookie("color_scheme_id", "901", { path: "/" });
        await visit("/latest");
        Site.current().set("user_themes", [
          {
            theme_id: currentThemeId(),
            name: "Dark base",
            color_scheme_id: 902,
            dark_color_scheme_id: 902,
          },
        ]);
        Session.current().setProperties({
          darkModeAvailable: true,
          defaultColorSchemeIsDark: false,
          userColorSchemeId: 901,
        });
        await click(trigger);
        await choose(".rpn-palette-selector__light", "-1");
        await waitUntil(
          () =>
            Session.current().defaultColorSchemeIsDark === true &&
            cookie("color_scheme_id") === "-1"
        );
        await settled();
        assert.true(Session.current().defaultColorSchemeIsDark);
        assert.strictEqual(cookie("color_scheme_id"), "-1");
        assert.dom(".rpn-palette-selector__mode").doesNotExist();
      });

      test("does not add a picker when no palettes are selectable", async function (assert) {
        await visit("/latest");
        Site.current().set("user_color_schemes", []);
        await settled();
        assert.dom(trigger).doesNotExist();
      });
    }
  );
}
