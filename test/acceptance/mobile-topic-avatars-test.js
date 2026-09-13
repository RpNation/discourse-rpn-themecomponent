import { click, visit } from "@ember/test-helpers";
import { test } from "qunit";
import { cloneJSON } from "discourse/lib/object";
import discoveryFixtures from "discourse/tests/fixtures/discovery-fixtures";
import { acceptance } from "discourse/tests/helpers/qunit-helpers";

const topicRow = '.topic-list-item[data-topic-id="99001"]';
const mobileAvatar = `${topicRow} .pull-left img.avatar`;

function stubTopicLists(needs) {
  needs.pretender((server, helper) => {
    for (const path of ["/latest.json", "/c/bug/1/l/latest.json"]) {
      server.get(path, () => {
        const response = cloneJSON(discoveryFixtures[path]);
        response.users.push(
          {
            id: 99001,
            username: "rpn_original_author",
            avatar_template: "/images/rpn-original-author.png",
          },
          {
            id: 99002,
            username: "rpn_latest_replier",
            avatar_template: "/images/rpn-latest-replier.png",
          }
        );
        Object.assign(response.topic_list.topics[0], {
          id: 99001,
          category_id: 1,
          last_poster_username: "rpn_latest_replier",
          posters: [
            {
              user_id: 99001,
              extras: "original",
              description: "Original Poster",
            },
            {
              user_id: 99002,
              extras: "latest",
              description: "Most Recent Poster",
            },
          ],
        });
        return helper.response(response);
      });
    }
  });
}

acceptance("RPN Foundation | Mobile topic avatars", function (needs) {
  needs.mobileView();
  stubTopicLists(needs);

  for (const path of ["/latest", "/c/bug"]) {
    test(`keeps the native last-poster avatar on ${path}`, async function (assert) {
      await visit(path);

      assert.dom(mobileAvatar).exists({ count: 1 }).isVisible();
      assert
        .dom(`${topicRow} .pull-left a`)
        .hasAttribute("href", "/u/rpn_latest_replier")
        .hasAttribute("data-user-card", "rpn_latest_replier");
      assert
        .dom(mobileAvatar)
        .hasAttribute("src", /\/images\/rpn-latest-replier\.png$/);
      assert
        .dom(`${topicRow} [data-user-card="rpn_original_author"]`)
        .doesNotExist();
      assert.dom(`${topicRow} .main-link .title`).exists();
      assert.dom(`${topicRow} .posters`).doesNotExist();
    });
  }
});

acceptance(
  "RPN Foundation | Mobile topic avatars | bulk select",
  function (needs) {
    needs.mobileView();
    needs.user();
    stubTopicLists(needs);

    test("lets native bulk-selection checkboxes replace avatars", async function (assert) {
      await visit("/latest");
      assert.dom(mobileAvatar).exists({ count: 1 });

      await click("button.bulk-select");

      assert.dom(mobileAvatar).doesNotExist();
      assert.dom(`${topicRow} .pull-left input.bulk-select`).isVisible();

      await click(`${topicRow} input.bulk-select`);

      assert.dom(`${topicRow} input.bulk-select`).isChecked();
      assert.dom(topicRow).hasClass("bulk-selected");
    });
  }
);

acceptance("RPN Foundation | Topic avatars | desktop", function (needs) {
  stubTopicLists(needs);

  test("keeps native participant avatars in the desktop posters column", async function (assert) {
    await visit("/latest");

    assert.dom(`${topicRow} .posters img.avatar`).exists({ count: 2 });
    assert
      .dom(`${topicRow} .posters [data-user-card="rpn_original_author"]`)
      .exists();
    assert
      .dom(`${topicRow} .posters [data-user-card="rpn_latest_replier"]`)
      .exists();
    assert.dom(mobileAvatar).doesNotExist();
  });
});
