// Category models are shared across routes. An array written by this component
// is a display result, not evidence that a later mount received every topic.
// Weak references keep no topic data alive and a fresh native response replaces
// these arrays with new, unmarked ones.
const compactedTopics = new WeakSet();

export function categoryDefinitionId(category) {
  return Number(
    category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1]
  );
}

export function setCategoryPreview(category, topic) {
  const topics = topic ? [topic] : [];
  compactedTopics.add(topics);
  category.set("topics", topics);
}

export function nativeCategoryPreview(category) {
  if (category.topic_count === 0) {
    return { topic: null, complete: true };
  }

  const supplied = category.topics;
  const native = Array.isArray(supplied) && !compactedTopics.has(supplied);
  const hasChildren =
    category.subcategory_ids?.length || category.subcategory_list?.length;
  const definition = categoryDefinitionId(category);
  const topics = Array.isArray(supplied) ? supplied : [];
  // Core has already attached these visible previews to this row. Parent rows
  // omit each topic's category ID, so they need verification, but their native
  // topic and avatar can stay visible while that request runs.
  const displayable = topics.filter(
    (topic) =>
      topic.id !== definition &&
      topic.visible !== false &&
      (topic.category_id === category.id || topic.category_id == null)
  );
  const scoped = displayable.filter(
    (topic) => topic.category_id === category.id || !hasChildren
  );
  const eligible = scoped.filter((topic) =>
    Number.isFinite(Date.parse(topic.bumped_at))
  );
  const dated = displayable.filter((topic) =>
    Number.isFinite(Date.parse(topic.bumped_at))
  );
  const topic =
    dated.reduce(
      (latest, candidate) =>
        !latest ||
        Date.parse(candidate.bumped_at) > Date.parse(latest.bumped_at) ||
        (Date.parse(candidate.bumped_at) === Date.parse(latest.bumped_at) &&
          candidate.id > latest.id)
          ? candidate
          : latest,
      null
    ) ||
    displayable[0] ||
    null;

  const allTopicsIncluded =
    Number.isInteger(category.topic_count) &&
    category.topic_count > 0 &&
    new Set(eligible.map((entry) => entry.id)).size >= category.topic_count;
  const activityDescending =
    [undefined, null, "", "default", "activity"].includes(
      category.sort_order
    ) && ![true, "true"].includes(category.sort_ascending);
  const hasOrdinaryTopic = eligible.some(
    (entry) => entry.pinned === false && !entry.unpinned
  );

  // Native previews put local pins first, and can omit pins a user dismissed.
  // Respect that native dismissal behavior; an ordinary activity-sorted preview
  // establishes the latest within that view. Custom sorts and previews filled
  // only with pins need more data unless all counted topics are already here.
  return {
    topic,
    complete:
      native &&
      scoped.length === eligible.length &&
      !(hasChildren && topics.some((entry) => entry.category_id == null)) &&
      (allTopicsIncluded || (activityDescending && hasOrdinaryTopic)),
  };
}
