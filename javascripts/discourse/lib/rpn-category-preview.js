import { get } from "@ember/object";

export function categoryDefinitionId(category) {
  return Number(
    category.topic_id || category.topic_url?.match(/\/(\d+)\/?$/)?.[1]
  );
}

// Keep the server's array and Topic objects intact. A result belongs only to
// the exact native response it verifies; a new response invalidates it.
export function setCategoryPreview(
  category,
  topic,
  source = get(category, "topics")
) {
  if (source !== get(category, "topics")) {
    return false;
  }
  category.set("rpnCategoryPreview", { source, topic: topic || null });
  return true;
}

export function resolvedCategoryPreview(category) {
  const source = get(category, "topics");
  const resolved = get(category, "rpnCategoryPreview");
  return resolved && resolved.source === source
    ? { topic: resolved.topic, complete: true }
    : nativeCategoryPreview(category);
}

export function nativeCategoryPreview(category) {
  const supplied = get(category, "topics");
  const hasChildren = Boolean(
    category.has_children ||
    category.subcategory_count > 0 ||
    category.subcategory_ids?.length ||
    category.subcategory_list?.length
  );
  const definition = categoryDefinitionId(category);
  // Core attaches authorized descendants to parent previews too. Neither a
  // missing category ID nor a zero direct-topic count makes them invalid.
  const displayable = (Array.isArray(supplied) ? supplied : []).filter(
    (topic) => topic.id !== definition && topic.visible !== false
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
    !hasChildren &&
    Number.isInteger(category.topic_count) &&
    category.topic_count > 0 &&
    new Set(dated.map((entry) => entry.id)).size >= category.topic_count;
  const activityDescending =
    [undefined, null, "", "default", "activity"].includes(
      category.sort_order
    ) && ![true, "true"].includes(category.sort_ascending);
  const hasOrdinaryTopic = dated.some(
    (entry) => entry.pinned === false && !entry.unpinned
  );
  const knownEmpty =
    !hasChildren && category.topic_count === 0 && !displayable.length;

  // Respect native dismissal and category scope. An ordinary activity-sorted
  // preview establishes latest within that native view. Pin-only/custom-sorted
  // lists still need verification unless every counted leaf topic is present.
  return {
    topic,
    complete:
      knownEmpty ||
      (Array.isArray(supplied) &&
        dated.length === displayable.length &&
        (allTopicsIncluded || (activityDescending && hasOrdinaryTopic))),
  };
}
