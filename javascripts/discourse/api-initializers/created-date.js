import { apiInitializer } from "discourse/lib/api";
import NavItem from "discourse/models/nav-item";
import I18n from "I18n";
// import TopicListHeaderCreatedColumn from "../components/topic-list-header-created-column";

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
  // note to self: don't use the topic-list-header.gjs
  // it is behind the experimental glimmer topic list groups
  // Once it is ready, can use the following:
  // api.renderInOutlet("topic-list-header-after", TopicListHeaderCreatedColumn);

  // see for alternative:
  // https://meta.discourse.org/t/new-th-in-topic-table/280116/2
  // https://meta.discourse.org/t/an-interesting-strategy-for-passing-properties-via-raw-template-plugin-outlets/210054/2
  // https://meta.discourse.org/t/how-to-implement-raw-plugin-outlet/178385
});
