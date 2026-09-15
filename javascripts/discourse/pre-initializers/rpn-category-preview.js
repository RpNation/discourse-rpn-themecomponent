import { withPluginApi } from "discourse/lib/plugin-api";
import { resolvedCategoryPreview } from "../lib/rpn-category-preview";

export default {
  name: "rpn-category-preview",
  before: "inject-discourse-objects",

  initialize() {
    withPluginApi((api) => {
      api.addModelField("category", "rpnCategoryPreview", {
        defaultValue: null,
      });
      api.addModelGetter("category", "featuredTopics", function () {
        const { topic } = resolvedCategoryPreview(this);
        return topic ? [topic] : [];
      });
    });
  },
};
