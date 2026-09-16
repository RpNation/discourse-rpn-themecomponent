import { get } from "@ember/object";
import { nativeCategoryPreview } from "./rpn-category-preview";

function categoryId(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^[1-9]\d*$/.test(String(value))
  ) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function topicCount(category) {
  for (const count of [
    get(category, "topics_all_time"),
    get(category, "topic_count"),
  ]) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      return count;
    }
  }

  return 0;
}

function hexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const color = value.trim().replace(/^#/, "");
  return /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : null;
}

// Project only the authorized rows supplied by core. Groups are presentation
// records, never Category models, and leave the actual hierarchy untouched.
export function buildCategoryGroups(categories, definitions) {
  const source = Array.isArray(categories) ? categories : [];
  const eligible = new Map();

  for (const category of source) {
    const id = categoryId(category?.id);
    if (
      id &&
      !eligible.has(id) &&
      !category.parent_category_id &&
      !category.isHidden &&
      !category.hasMuted
    ) {
      eligible.set(id, category);
    }
  }

  const names = new Set();
  const groupsByCategory = new Map();

  for (const definition of Array.isArray(definitions) ? definitions : []) {
    const name =
      typeof definition?.name === "string" ? definition.name.trim() : "";
    if (!name || names.has(name) || !Array.isArray(definition.category_ids)) {
      continue;
    }

    const requested = new Set(
      definition.category_ids.map(categoryId).filter(Boolean)
    );
    const members = [...eligible].flatMap(([id, category]) =>
      requested.has(id) && !groupsByCategory.has(id) ? [category] : []
    );
    if (!members.length) {
      continue;
    }

    const group = {
      key: `group:${name}`,
      name,
      description:
        typeof definition.description === "string"
          ? definition.description.trim()
          : "",
      icon: typeof definition.icon === "string" ? definition.icon.trim() : "",
      members,
      anchor: members[0],
      get color() {
        return hexColor(definition.color) ?? get(members[0], "color");
      },
      // Derive these fields independently so count updates do not invalidate
      // the group structure or recreate an unchanged preview avatar.
      get topicCount() {
        // Native totals already include authorized subcategories.
        return members.reduce(
          (total, category) => total + topicCount(category),
          0
        );
      },
      // Keep the native Topic and poster identities. No supplementary requests
      // or saved preview state can replace the initial avatar after rendering.
      get topic() {
        return nativeCategoryPreview({
          topics: members.map(nativeCategoryPreview).filter(Boolean),
        });
      },
    };

    names.add(name);
    for (const category of members) {
      groupsByCategory.set(categoryId(category.id), group);
    }
  }

  return source.flatMap((category) => {
    const group = groupsByCategory.get(categoryId(category?.id));
    if (!group) {
      return [{ category }];
    }
    return group.anchor === category ? [{ group }] : [];
  });
}
