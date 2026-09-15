import { action } from "@ember/object";
import { apiInitializer } from "discourse/lib/api";

const originalPadding = new WeakMap();

function restorePadding(menu) {
  if (originalPadding.has(menu)) {
    menu.options = { ...menu.options, padding: originalPadding.get(menu) };
    originalPadding.delete(menu);
  }
}

function useComposerViewport(menu) {
  if (
    !menu?.triggerElement?.closest("#reply-control.fullscreen") ||
    menu.renderInModal
  ) {
    restorePadding(menu);
    return;
  }

  if (menu.options.padding != null) {
    return;
  }

  // Native menus reserve the site's header height by default. The fullscreen
  // composer covers that header, so its menus can use the whole viewport.
  originalPadding.set(menu, menu.options.padding);
  menu.options = {
    ...menu.options,
    padding: { top: 0, left: 10, right: 10, bottom: 10 },
  };
}

export default apiInitializer((api) => {
  api.modifyClass(
    "service:menu",
    (Superclass) =>
      class extends Superclass {
        newInstance() {
          const menu = super.newInstance(...arguments);
          useComposerViewport(menu);
          return menu;
        }

        @action
        show(menu) {
          useComposerViewport(menu);
          return super.show(...arguments);
        }

        @action
        async close(menu) {
          const instance =
            typeof menu === "string" ? this.getByIdentifier(menu) : menu;
          const result = await super.close(...arguments);

          if (!instance?.expanded) {
            restorePadding(instance);
          }

          return result;
        }
      }
  );
});
