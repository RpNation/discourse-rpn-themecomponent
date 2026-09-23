import PluginOutlet from "discourse/components/plugin-outlet";
import lazyHash from "discourse/helpers/lazy-hash";
import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import RpnFeaturedTopic from "../components/rpn-featured-topic";
import { nativeCategoryPreview } from "../lib/rpn-category-preview";

const RpnCategoryLatest = <template>
  {{! The outlet does not expose whether the row belongs to the muted list. }}
  {{#if @outletArgs.category.hasMuted}}
    {{yield}}
  {{else if @outletArgs.showTopics}}
    <td class="latest rpn-category-latest">
      {{#each @outletArgs.category.featuredTopics key="id" as |topic|}}
        <RpnFeaturedTopic @topic={{topic}} />
      {{/each}}
    </td>
    <PluginOutlet
      @name="category-list-after-latest-section"
      @outletArgs={{lazyHash category=@outletArgs.category}}
    />
  {{/if}}
</template>;

export default apiInitializer((api) => {
  // The optional plugin also defines featuredTopics. Keep the theme's native
  // preview selection regardless of which model getter was registered last.
  if ("categoryLatestTopicsActive" in Category.prototype) {
    api.registerValueTransformer(
      "category-latest-topics-featured-fallback",
      ({ context }) => {
        const topic = nativeCategoryPreview(context.category);
        return topic ? [topic] : [];
      }
    );
  }

  api.renderInOutlet("category-list-latest-wrapper", RpnCategoryLatest);
});
