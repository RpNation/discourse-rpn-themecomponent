import { withPluginApi } from "discourse/lib/plugin-api";
import { nativeCategoryPreview } from "../lib/rpn-category-preview";

export default {
  name: "rpn-category-preview",
  before: "inject-discourse-objects",

  initialize() {
    withPluginApi((api) => {
      api.addModelGetter("category", "featuredTopics", function () {
        const topic = nativeCategoryPreview(this);
        return topic ? [topic] : [];
      });
    });
  },
};
