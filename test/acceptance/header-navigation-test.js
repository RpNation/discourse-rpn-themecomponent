import { click, currentURL, find, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { withPluginApi } from "discourse/lib/plugin-api";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const nav = ".rpn-header-navigation";

for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Header navigation | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }

      needs.hooks.beforeEach(() => {
        settings.header_links = [
          { label: "Home", icon: "house", url: "/" },
          { label: "Gallery", icon: "images", url: "" },
          { label: "Staff Contact", icon: "envelope", url: "" },
        ];
      });

      test("configured destinations activate placeholders and respect button order", async function (assert) {
        settings.header_links = [
          { label: "Contact staff", icon: "envelope", url: "  /about  " },
          { label: "Artwork", icon: "images", url: "" },
          { label: "Members", icon: "users", url: "/u" },
        ];

        await visit("/latest");
        assert.dom(nav).hasText("Contact staff Artwork Members");
        assert.dom(`${nav} a:first-child`).hasAttribute("href", "/about");
        assert.dom(`${nav} button`).isDisabled();
        assert
          .dom(`${nav} button`)
          .hasAttribute("title", "Artwork (coming soon)");
        assert.dom(`${nav} .d-icon-users`).exists();
        assert.dom(`${nav} a[aria-label='Home']`).doesNotExist();
        await click(`${nav} a:first-child`);
        assert.strictEqual(currentURL(), "/about");
      });

      test("the root destination follows native home URL transformations", async function (assert) {
        withPluginApi((api) => {
          api.registerValueTransformer("home-logo-href", () => "/about");
        });
        await visit("/latest");
        assert.dom(`${nav} a`).hasAttribute("href", "/about");
        await click(`${nav} a`);
        assert.strictEqual(currentURL(), "/about");
      });

      test("external links retain normal browser navigation", async function (assert) {
        settings.header_links = [
          { label: "Gallery", icon: "images", url: "https://example.com/art" },
        ];
        await visit("/latest");
        assert.dom(`${nav} a`).hasAttribute("href", "https://example.com/art");

        let intercepted;
        // Inspect after the element's handler, then stop the real navigation.
        find(nav).addEventListener(
          "click",
          (event) => {
            intercepted = event.defaultPrevented;
            event.preventDefault();
          },
          { once: true }
        );
        await click(`${nav} a`);
        assert.false(intercepted);
        assert.strictEqual(currentURL(), "/latest");
      });

      test("blank or unsafe URLs stay disabled and labels remain plain text", async function (assert) {
        settings.header_links = [
          {
            label: "<b>Gallery</b>",
            icon: "images",
            // eslint-disable-next-line no-script-url -- Invalid admin input must never become a link.
            url: "javascript:alert(1)",
          },
          { label: "Staff Contact", icon: "envelope", url: "   " },
          { label: "Missing URL", icon: "house" },
          { label: "Invalid URL", icon: "house", url: "https://" },
        ];
        await visit("/latest");
        assert.dom(`${nav} a`).doesNotExist();
        assert.dom(`${nav} button:disabled`).exists({ count: 4 });
        assert.dom(`${nav} b`).doesNotExist();
        assert.dom(`${nav} button:first-child`).hasText("<b>Gallery</b>");
      });

      test("clearing the list removes the navigation", async function (assert) {
        settings.header_links = [];
        await visit("/latest");
        assert.dom(nav).doesNotExist();
        assert.dom(".rpn-masthead").exists();
      });
    }
  );
}
