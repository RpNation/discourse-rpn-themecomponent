import { apiInitializer } from "discourse/lib/api";
import NavItem from "discourse/models/nav-item";
import I18n from "I18n";

export default apiInitializer("1.30.0", (api) => {
  if (settings.enable_sort_by_created_date_nav_bar_item) {
    api.addNavigationBarItem({
      name: "created_date",
      displayName: I18n.t(themePrefix("filters.created_date.title")),
      title: I18n.t(themePrefix("filters.created_date.help")),
      before: "top",
      customHref: (category, args) => {
        const path = NavItem.pathFor("latest", args);
        return `${path}?order=created`;
      },
      forceActive: (category, args, router) => {
        const queryParams = router.currentRoute.queryParams;
        return (
          queryParams &&
          Object.keys(queryParams).length === 1 &&
          queryParams["order"] === "created"
        );
      },
    });
  }
});
