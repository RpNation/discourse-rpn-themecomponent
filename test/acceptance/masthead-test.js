import { click, currentURL, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { removeCookie } from "discourse/lib/cookie";
import { withPluginApi } from "discourse/lib/plugin-api";
import { SCROLLED_DOWN } from "discourse/services/scroll-direction";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const logo = "/images/discourse-logo-sketch.png?masthead";
const mobileLogo = "/images/discourse-logo-sketch.png?mobile-masthead";
const darkLogo = "/images/discourse-logo-sketch.png?dark-masthead";
const mobileDarkLogo = "/images/discourse-logo-sketch.png?mobile-dark-masthead";

function configure(needs, mobile = false) {
  if (mobile) {
    needs.mobileView();
  }
  needs.settings({
    title: "RpNation",
    site_logo_url: logo,
    site_mobile_logo_url: mobileLogo,
    site_logo_dark_url: darkLogo,
    site_mobile_logo_dark_url: mobileDarkLogo,
    site_logo_small_url: "/images/discourse-logo-sketch.png?small",
  });
  needs.pretender((server, helper) => {
    server.get("/filter.json", () =>
      helper.response({ users: [], topic_list: { topics: [] } })
    );
  });
}

acceptance("RPN Foundation | Masthead | desktop", function (needs) {
  configure(needs);

  test("uses the configured native logo once above navigation", async function (assert) {
    await visit("/latest");
    assert.dom("#site-logo").exists({ count: 1 });
    assert.dom(".rpn-masthead #site-logo").hasAttribute("src", logo);
    assert.dom(".rpn-masthead #site-logo").hasAttribute("alt", "RpNation");
    assert.dom(".d-header #site-logo").doesNotExist();
    assert.dom(".d-header .rpn-home-link").doesNotExist();
  });

  test("masthead respects native URL transformation and client navigation", async function (assert) {
    withPluginApi((api) => {
      api.registerValueTransformer("home-logo-href", () => "/latest");
      api.registerValueTransformer("home-logo-image-url", ({ value }) =>
        value ? `${value}&transformed` : value
      );
    });
    await visit("/categories");
    assert.dom(".rpn-masthead a").hasAttribute("href", "/latest");
    assert
      .dom(".rpn-masthead #site-logo")
      .hasAttribute("src", `${logo}&transformed`);
    await click(".rpn-masthead a");
    assert.strictEqual(currentURL(), "/latest");
  });

  test("keeps the native docked topic title without a second logo", async function (assert) {
    await visit("/t/internationalization-localization/280");
    const header = this.container.lookup("service:header");
    this.container.lookup("service:scroll-direction").lastScrollDirection =
      SCROLLED_DOWN;
    header.mainTopicTitleVisible = false;
    await settled();
    assert.true(header.topicInfoVisible);
    assert.dom(".d-header .header-title").exists();
    assert.dom(".rpn-home-link__label").doesNotExist();
    assert.dom("#site-logo").exists({ count: 1 });
    assert.dom(".rpn-masthead #site-logo").hasAttribute("src", logo);
  });
});

acceptance("RPN Foundation | Masthead | mobile", function (needs) {
  configure(needs, true);

  test("uses the mobile logo without duplicating it in navigation", async function (assert) {
    await visit("/latest");
    assert.dom("#site-logo").exists({ count: 1 });
    assert.dom(".rpn-masthead #site-logo").hasAttribute("src", mobileLogo);
    assert.dom(".d-header .rpn-home-link").doesNotExist();
  });
});

for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Masthead | dark ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      configure(needs, mobile);
      needs.hooks.afterEach(() =>
        removeCookie("forced_color_mode", { path: "/" })
      );

      test("native dark logo follows forced and automatic appearance", async function (assert) {
        withPluginApi((api) => {
          api.container.lookup("service:session").setProperties({
            darkModeAvailable: true,
            defaultColorSchemeIsDark: false,
          });
        });
        await visit("/latest");
        const interfaceColor = this.container.lookup("service:interface-color");
        assert
          .dom(".rpn-masthead picture source")
          .hasAttribute("srcset", mobile ? mobileDarkLogo : darkLogo);
        interfaceColor.forceDarkMode();
        await settled();
        assert.dom(".rpn-masthead picture source").hasAttribute("media", "all");
        interfaceColor.forceLightMode();
        await settled();
        assert
          .dom(".rpn-masthead picture source")
          .hasAttribute("media", "none");
        interfaceColor.useAutoMode();
        await settled();
        assert
          .dom(".rpn-masthead picture source")
          .hasAttribute("media", "(prefers-color-scheme: dark)");
        assert.dom("#site-logo").exists({ count: 1 });
      });
    }
  );
}

acceptance("RPN Foundation | Masthead | text fallback", function (needs) {
  needs.settings({
    title: "RpNation",
    site_logo_url: "",
    site_logo_dark_url: "",
    site_mobile_logo_url: "",
  });

  test("uses the site title when no logo is configured", async function (assert) {
    await visit("/latest");
    assert.dom("#site-logo").doesNotExist();
    assert.dom(".rpn-masthead .text-logo").exists({ count: 1 });
    assert.dom(".rpn-masthead .text-logo").hasText("RpNation");
    assert.dom(".rpn-home-link").doesNotExist();
  });
});
