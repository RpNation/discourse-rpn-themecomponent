import Component from "@glimmer/component";
import { apiInitializer } from "discourse/lib/api";
import {
  normalizePostMarkerRules,
  postMarkerColor,
  postMarkerStyles,
} from "../lib/rpn-post-marker-colors";

class PostMarkerStyles extends Component {
  get css() {
    return postMarkerStyles(
      normalizePostMarkerRules(settings.post_marker_colors)
    );
  }

  <template>
    {{#if this.css}}
      {{! Only generated class names and validated hex colors enter this stylesheet. }}
      {{! eslint-disable-next-line ember/template-no-forbidden-elements }}
      <style class="rpn-post-marker-colors">
        {{this.css}}
      </style>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  const site = api.container.lookup("service:site");

  api.registerValueTransformer("post-class", ({ value, context }) => {
    const rules = normalizePostMarkerRules(settings.post_marker_colors);
    const color = postMarkerColor(context.post, rules, site.groups);
    return color ? [...value, `rpn-post-marker--${color}`] : value;
  });
  api.renderInOutlet("before-main-outlet", PostMarkerStyles);
});
