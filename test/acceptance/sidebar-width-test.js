import { click, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const button = ".rpn-width-toggle";
const storageKey = "rpn-full-width";

acceptance("RPN Foundation | Sidebar width", function (needs) {
  needs.settings({ navigation_menu: "sidebar" });
  needs.hooks.afterEach(() => {
    window.localStorage.removeItem(storageKey);
    document.documentElement.classList.remove(storageKey);
  });

  test("toggles full width and saves the preference", async function (assert) {
    await visit("/latest");
    assert.dom(button).exists({ count: 1 });
    assert.dom(button).hasAttribute("aria-pressed", "false");

    await click(button);
    assert.dom(document.documentElement).hasClass(storageKey);
    assert.dom(button).hasAttribute("aria-pressed", "true");
    assert.strictEqual(window.localStorage.getItem(storageKey), "true");

    await visit("/categories");
    assert.dom(button).hasAttribute("aria-pressed", "true");
    assert.dom(document.documentElement).hasClass(storageKey);

    await click(button);
    assert.dom(document.documentElement).doesNotHaveClass(storageKey);
    assert.dom(button).hasAttribute("aria-pressed", "false");
    assert.strictEqual(window.localStorage.getItem(storageKey), "false");
  });
});
