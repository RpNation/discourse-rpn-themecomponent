const UNSUPPORTED_GROUP_IDS = new Set([0, 4, 5, 10, 11, 12, 13, 14]);

function groupId(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && !UNSUPPORTED_GROUP_IDS.has(id) ? id : null;
}

function hexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(value.trim());
  return match ? match[1].toLowerCase() : null;
}

export function normalizePostMarkerRules(definitions) {
  return (Array.isArray(definitions) ? definitions : []).flatMap(
    (definition) => {
      const color = hexColor(definition?.color);
      const groupIds = [
        ...new Set(
          (Array.isArray(definition?.group_ids) ? definition.group_ids : [])
            .map(groupId)
            .filter(Boolean)
        ),
      ];
      return color && groupIds.length ? [{ groupIds, color }] : [];
    }
  );
}

export function postMarkerColor(post, rules, siteGroups = []) {
  if (!post) {
    return null;
  }

  const primaryGroup = post.primary_group_name?.toLowerCase();
  const groupNames = new Map(
    siteGroups.map((group) => [groupId(group.id), group.name?.toLowerCase()])
  );

  for (const { groupIds, color } of rules) {
    const matches = groupIds.some((id) => {
      switch (id) {
        case 1:
          return post.admin === true;
        case 2:
          return post.moderator === true;
        case 3:
          return (
            post.staff === true ||
            post.admin === true ||
            post.moderator === true
          );
        default:
          // Other memberships are not serialized with native posts. A primary
          // group can match immediately when it is visible to this reader.
          return Boolean(primaryGroup && groupNames.get(id) === primaryGroup);
      }
    });
    if (matches) {
      return color;
    }
  }
  return null;
}

export function postMarkerStyles(rules) {
  // Only validated hex digits enter a selector or declaration; group names and
  // setting labels never become CSS or HTML.
  return [...new Set(rules.map((rule) => hexColor(rule.color)).filter(Boolean))]
    .map(
      (color) =>
        `.rpn-post-marker--${color}{--rpn-post-marker-color:#${color};}`
    )
    .join("\n");
}
