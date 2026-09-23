import { get } from "@ember/object";

// The optional latest-topics plugin supplies a separately authorized winner.
// An empty plugin result stays empty; falling back could reintroduce a pin.
// Otherwise select from native previews. Preserve Topic and poster identities.
export function nativeCategoryPreview(category) {
  const definition = Number(
    category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1]
  );
  const supplied = get(category, "categoryLatestTopicsActive")
    ? get(category, "latestTopics")
    : get(category, "topics");
  const displayable = (Array.isArray(supplied) ? supplied : []).filter(
    (topic) => topic.id !== definition && topic.visible !== false
  );
  let latest = null;
  for (const topic of displayable) {
    const bumpedAt = Date.parse(topic.bumped_at);
    if (!Number.isFinite(bumpedAt)) {
      continue;
    }
    if (
      !latest ||
      bumpedAt > Date.parse(latest.bumped_at) ||
      (bumpedAt === Date.parse(latest.bumped_at) && topic.id > latest.id)
    ) {
      latest = topic;
    }
  }
  return latest || displayable[0] || null;
}
