import PluginOutlet from "discourse/components/plugin-outlet";
import lazyHash from "discourse/helpers/lazy-hash";
import { apiInitializer } from "discourse/lib/api";
import RpnFeaturedTopic from "../components/rpn-featured-topic";

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
  api.renderInOutlet("category-list-latest-wrapper", RpnCategoryLatest);
});
