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
import selectKit from "discourse/tests/helpers/select-kit-helper";

async function choose(selector, value) {
  const control = selectKit(selector);
  if (!control.isExpanded()) {
    await control.expand();
  }
  await control.selectRowByValue(value);
}

const trigger = ".rpn-palette-selector__trigger";

function assertControlLabels(assert) {
  for (const [control, label] of [
    ["light", "Light palette"],
    ["dark", "Dark palette"],
    ["mode", "Appearance"],
  ]) {
    assert
      .dom(`.rpn-palette-selector__${control} .select-kit-header`)
      .hasAttribute("aria-label", label);
  }
}

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

    for (const target of [
      panel,
      panel.querySelector(".rpn-palette-selector__field-label"),
    ]) {
      await touchStart(target);
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      assert.strictEqual(find(".hamburger-panel"), sidebar);
      assert.true(dialog.isConnected, "the dialog remains mounted");
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
    assertControlLabels(assert);
    const panel = find(".rpn-palette-selector__panel");
    const sidebar = find(".hamburger-panel");

    for (const [selector, value, cookieName] of [
      [".rpn-palette-selector__light", "901", "color_scheme_id"],
      [".rpn-palette-selector__dark", "902", "dark_scheme_id"],
      [".rpn-palette-selector__mode", "dark", "forced_color_mode"],
    ]) {
      const control = find(selector);
      const dropdown = selectKit(selector);
      const header = dropdown.header().el();
      await touchStart(header);
      assert.strictEqual(
        find(selector),
        control,
        "pointerdown keeps the control mounted"
      );
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      assert.strictEqual(find(".hamburger-panel"), sidebar);
      await triggerEvent(header, "pointerup", { pointerType: "touch" });
      await dropdown.expand();
      const row = dropdown.rowByValue(value).el();
      assert.true(
        panel.contains(row),
        "choices render inside the palette panel"
      );
      await touchStart(row);
      assert.strictEqual(find(".rpn-palette-selector__panel"), panel);
      await triggerEvent(row, "pointerup", { pointerType: "touch" });
      await choose(selector, value);
      await waitUntil(() => cookie(cookieName) === value);
      assert.strictEqual(dropdown.header().value(), value);
      assert.false(dropdown.isDisabled());
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
        assertControlLabels(assert);
        assert.dom(".rpn-palette-selector__panel select").doesNotExist();
        const light = selectKit(".rpn-palette-selector__light");
        await light.expand();
        assert
          .dom('.rpn-palette-selector__light .select-kit-row[data-value="901"]')
          .exists();
        assert
          .dom('.rpn-palette-selector__light .select-kit-row[data-value="902"]')
          .doesNotExist();
        assert.true(
          find(".rpn-palette-selector__panel").contains(
            light.rowByValue(901).el()
          ),
          "light choices render inside the palette panel"
        );
        await light.collapse();
        const dark = selectKit(".rpn-palette-selector__dark");
        await dark.expand();
        assert
          .dom('.rpn-palette-selector__dark .select-kit-row[data-value="902"]')
          .exists();
        assert
          .dom('.rpn-palette-selector__dark .select-kit-row[data-value="901"]')
          .doesNotExist();
        await dark.collapse();

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
        const light = selectKit(".rpn-palette-selector__light");
        assert.strictEqual(light.header().value(), "901");
        assert.false(light.isDisabled());
        assert.strictEqual(cookie("color_scheme_id"), "901");
        assert.strictEqual(cookie("dark_scheme_id"), "902");
      });

      test("selects appearance with the ComboBox keyboard controls", async function (assert) {
        cookie("forced_color_mode", "auto", { path: "/" });
        await visit("/latest");
        Session.current().setProperties({
          darkModeAvailable: true,
          defaultColorSchemeIsDark: false,
        });
        await click(trigger);
        const mode = selectKit(".rpn-palette-selector__mode");
        await mode.expand();
        await mode.keyboard("down", ".select-kit-header");
        await mode.keyboard("enter", ".select-kit-header");
        assert.strictEqual(mode.header().value(), "light");
        assert.strictEqual(cookie("forced_color_mode"), "light");
        assert.false(mode.isExpanded());
        assert.dom(".rpn-palette-selector__panel").exists();
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
