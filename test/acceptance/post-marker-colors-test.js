import { getOwner } from "@ember/owner";
import { find, findAll, settled, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import { withPluginApi } from "discourse/lib/plugin-api";
import topicFixtures from "discourse/tests/fixtures/topic";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const postSelector = (number) => `.topic-post[data-post-number="${number}"]`;
const styleSelector = "style.rpn-post-marker-colors";
const groupRules = [
  { name: "Admins", group_ids: [1], color: "#FF0000" },
  { name: "Moderators", group_ids: [2], color: "#9735CA" },
  { name: "Writers", group_ids: [42], color: "#00AA88" },
];

// Theme QUnit does not load the theme SCSS. Verify the public class extension,
// safe stylesheet, and native post data here; check PM marker visibility and
// actual colors in a browser with the compiled stylesheet.
for (const mobile of [false, true]) {
  acceptance(
    `RPN Foundation | Post marker colors | ${mobile ? "mobile" : "desktop"}`,
    function (needs) {
      if (mobile) {
        needs.mobileView();
      }
      needs.user({
        admin: true,
        moderator: true,
        primary_group_name: "Writers",
      });
      needs.site({
        groups: [
          { id: 1, name: "admins" },
          { id: 2, name: "moderators" },
          { id: 42, name: "Writers" },
        ],
      });
      let response;
      let membershipRequests;
      needs.hooks.beforeEach(() => {
        settings.post_marker_colors = cloneJSON(groupRules);
        membershipRequests = [];
        response = cloneJSON(topicFixtures["/t/280/1.json"]);
        const template = response.post_stream.posts[0];
        const authors = [
          { admin: true, moderator: true },
          { moderator: true },
          { primary_group_name: "wRiTeRs" },
          { primary_group_name: "Other" },
        ];
        response.post_stream.posts = authors.map((author, index) => ({
          ...cloneJSON(template),
          id: 99101 + index,
          user_id: 99101 + index,
          username: `marker_author_${index + 1}`,
          name: `Marker author ${index + 1}`,
          display_username: `Marker author ${index + 1}`,
          post_number: index + 1,
          cooked: `<p>Marker sample ${index + 1}</p>`,
          admin: false,
          moderator: false,
          staff: false,
          yours: false,
          primary_group_name: null,
          reply_count: 0,
          reply_to_post_number: null,
          link_counts: [],
          ...author,
        }));
        response.post_stream.stream = response.post_stream.posts.map(
          (post) => post.id
        );
        response.posts_count = 4;
        response.highest_post_number = 4;
        response.last_read_post_number = 0;
      });
      needs.pretender((server, helper) => {
        server.get("/t/280.json", () => helper.response(response));
        server.get("/t/280/:post_number.json", () => helper.response(response));
        ["/groups/:name/members.json", "/u/:username.json"].forEach((path) => {
          server.get(path, (request) => {
            membershipRequests.push(request.url);
            return helper.response(500, {});
          });
        });
      });
      needs.hooks.afterEach(function (assert) {
        assert.deepEqual(
          membershipRequests,
          [],
          "markers do not request profiles or group memberships"
        );
      });

      test("uses author roles and primary group immediately without changing native post markup", async function (assert) {
        settings.post_marker_colors = [
          ...groupRules,
          { name: "Staff", group_ids: [3], color: "#FFAA00" },
        ];
        withPluginApi((api) => {
          api.registerValueTransformer("post-class", ({ value }) => [
            ...value,
            "other-post-extension",
          ]);
        });
        await visit("/t/internationalization-localization/280");

        assert.dom(postSelector(1)).hasClass("rpn-post-marker--ff0000");
        assert.dom(postSelector(2)).hasClass("rpn-post-marker--9735ca");
        assert.dom(postSelector(3)).hasClass("rpn-post-marker--00aa88");
        assert.dom(postSelector(4)).doesNotHaveClass("rpn-post-marker--ff0000");
        assert.dom(postSelector(4)).doesNotHaveClass("rpn-post-marker--9735ca");
        assert.dom(postSelector(4)).doesNotHaveClass("rpn-post-marker--00aa88");
        assert.dom(postSelector(4)).doesNotHaveClass("rpn-post-marker--ffaa00");
        assert.dom(`${postSelector(4)} .cooked`).hasText("Marker sample 4");
        assert
          .dom(`${postSelector(3)} [data-user-card="marker_author_3"]`)
          .exists();
        assert.dom(".topic-post.other-post-extension").exists({ count: 4 });
        assert.dom(styleSelector).exists({ count: 1 });
        assert.true(
          find(styleSelector).textContent.includes(
            ".rpn-post-marker--00aa88{--rpn-post-marker-color:#00aa88;}"
          )
        );

        const nativePosts = findAll(".topic-post");
        const avatars = findAll(".topic-post .topic-avatar img.avatar");
        const controller = getOwner(this).lookup("controller:topic");
        const topic = controller.model;
        const post = topic.postStream.posts[3];
        const author = post.user;
        // Unlike user_title or primary_group_name, staff does not invalidate
        // core's cached Post.user. Changing it exercises our marker class
        // without deliberately asking core to replace the avatar's User.
        post.set("staff", true);
        await settled();

        assert.dom(postSelector(4)).hasClass("rpn-post-marker--ffaa00");
        assert.strictEqual(post.user, author, "the native author is retained");
        assert.strictEqual(
          controller.model,
          topic,
          "the native topic is retained"
        );
        assert.strictEqual(
          topic.postStream.posts[3],
          post,
          "the native author post is retained"
        );
        assert.deepEqual(
          findAll(".topic-post"),
          nativePosts,
          "post elements remain mounted"
        );
        assert.deepEqual(
          findAll(".topic-post .topic-avatar img.avatar"),
          avatars,
          "avatar elements remain mounted"
        );
      });

      test("changing configured order gives a primary group priority over staff roles", async function (assert) {
        settings.post_marker_colors = [
          groupRules[2],
          groupRules[1],
          groupRules[0],
        ];
        response.post_stream.posts[0].primary_group_name = "Writers";
        await visit("/t/internationalization-localization/280");

        assert.dom(postSelector(1)).hasClass("rpn-post-marker--00aa88");
        assert.dom(postSelector(1)).doesNotHaveClass("rpn-post-marker--ff0000");
        assert.dom(postSelector(2)).hasClass("rpn-post-marker--9735ca");
      });

      test("clearing the setting leaves posts at the ordinary marker fallback", async function (assert) {
        settings.post_marker_colors = [];
        await visit("/t/internationalization-localization/280");

        assert.dom(".topic-post").exists({ count: 4 });
        assert.dom('.topic-post[class*="rpn-post-marker--"]').doesNotExist();
        assert.dom(styleSelector).doesNotExist();
      });

      test("invalid color input never creates a marker, markup, or stylesheet content", async function (assert) {
        settings.post_marker_colors = [
          { group_ids: [1], color: "</style><script>invalid()</script>" },
          { group_ids: [2], color: "fff;}body{display:none" },
          { group_ids: [42], color: "#00AA88" },
        ];
        await visit("/t/internationalization-localization/280");

        assert.dom(postSelector(1)).doesNotHaveClass("rpn-post-marker--ff0000");
        assert.dom(postSelector(2)).doesNotHaveClass("rpn-post-marker--9735ca");
        assert.dom(postSelector(3)).hasClass("rpn-post-marker--00aa88");
        assert.strictEqual(
          find(styleSelector).textContent.trim(),
          ".rpn-post-marker--00aa88{--rpn-post-marker-color:#00aa88;}"
        );
      });
    }
  );
}
