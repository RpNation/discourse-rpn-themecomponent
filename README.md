# RpNation — Foundation Component

A **Discourse theme component for Foundation**, the default Discourse theme. It
adds RpNation's dark linen appearance and forum layout while leaving Foundation
and Discourse core responsible for the underlying interface. It is not a
standalone theme and no longer requires Graceful.

## Features

- Dark linen background, inset sidebar, and centered content panel.
- Adjustable site and topic/post widths.
- Desktop and mobile category featured topics with latest-poster avatars, topic
  status, unread badges, and dates.
- Custom category-section headings for any category ID, with no preset names or IDs.
- Subtle topic-list shading and post dividers, without boxed posts.
- Desktop layout adjustments for topic timelines, the composer, user pages, and
  full-page chat. Chat stays beside the sidebar inside the centered site layout.
- Existing custom icon sprite and optional RpNation content styling retained.

Categories involved in muting keep Discourse's native latest-topic rendering so
that hidden and expanded muted-category lists preserve their normal behavior.

## Installation

1. In **Admin → Appearance → Themes & components**, install this repository as a
   component:
   `https://github.com/RpNation/discourse-rpn-themecomponent`.
2. Under **Include component on these themes**, select **Foundation**.
3. Set `desktop_category_page_style` to `categories_with_featured_topics` to show
   the category table with latest topics and their last-poster avatars. The
   separate two-column categories/latest layout is not this layout.
   For mobile featured-topic avatars, set `mobile_category_page_style` to
   `categories_with_featured_topics` or `subcategories_with_featured_topics`.
   Category-only layouts have no featured topics to display avatars beside.
4. To use Categories as the homepage, put `categories` first in the site's
   `top_menu` setting.
5. Optionally add your own category sections in the component settings below.

Use a current Discourse release with Foundation and the
`category-list-latest-wrapper` outlet. This component is developed against
Discourse core `d636e2370b` (2026-08-28); compatibility with older releases and
other parent themes is not guaranteed. It intentionally applies a dark palette,
including when a user selects a light color scheme. Mobile keeps Discourse's
native layout with the shared RpNation colors.

## Component settings

| Setting               | Default | Purpose                                                                                        |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `site_max_width`      | `1280`  | Main site content maximum in pixels; Discourse adds the sidebar alongside it. Range: 960–1920. |
| `topic_content_width` | `900`   | Topic/post content maximum in pixels, subject to available viewport space. Range: 640–1200.    |
| `category_sections`   | Empty   | A list of your own section headings and the category IDs they appear above.                    |

### Adding category sections

In **Admin → Appearance → Themes & components**, open this component and edit
**Category sections**. Add an entry with:

- **Heading**: the text to display, for example `Resources`.
- **Category ID**: the positive numeric ID of the category that starts the
  section. For example, `/c/category-name/123` has ID `123`.

Add as many entries as you need. The list starts empty and contains no
RpNation-specific headings or category IDs. Remove an entry to remove its
heading, or clear the list to hide all section headings. IDs are entered directly
so Uncategorized and other categories excluded from Discourse's category picker
can also be used.

Headings appear above matching visible category rows on desktop and mobile,
including Categories only and the featured-topic layouts. Both use the same
settings; no separate mobile configuration is needed. They are not added to
category boxes. Nested category badges and parent-group labels do not become
separate rows; a heading appears only in a view where that category has its own
row. Missing or inaccessible categories do not produce a heading.

The first valid entry for a repeated category ID wins. Entries do not reorder
categories, create them, or change their permissions. Category ordering and access
remain site administration settings. Headings are plain text, not HTML.

Version 1.1 removes the six old, site-specific ID settings and their defaults.
They are intentionally not migrated; add any sections you want in the new list.

## Upgrading from the Graceful-era component

Preview this update on Foundation before applying it to a live site. Export the
old theme/component and its settings first. The old implementation remains in
Git history.

- Replace Graceful with Foundation for this component; do not run both versions
  of the RpNation component together.
- The legacy Handlebars overrides for featured topics and mobile category topics
  are replaced by a modern `.gjs` outlet initializer. The old custom mobile
  layout and Graceful/DiscoTOC layout workarounds are removed.
- Category headings move from hardcoded SCSS IDs into the optional, initially
  empty **Category sections** setting.
- Custom site/topic width settings replace the need for Discourse-custom-width.
- This component no longer declares dependencies on category-icons,
  category-banners, Discourse-custom-width, clickable-topic, DiscoTOC, or
  color-scheme-toggle. This update does **not** uninstall those components from
  your site. Review Foundation's enabled components and retain any optional
  features you still use; overlapping width/color/layout components may conflict.
- The custom category icon sprite is retained because existing category/icon
  settings may reference its symbols. Its unused CSS mapping file and the unused
  skulls background are removed. Linen is the active background; experimental
  edges/asanoha images from development are not shipped.
- Signature truncation, `.rs-component` panels, `.patreonimg` sizing, and the
  custom cookie icon colors are retained as optional integration styles. Their
  plugins/content are not installed by this component.

No users, categories, permissions, posts, or other site data are bundled or
migrated by this repository.

## Development and checks

Use the [Discourse Theme CLI](https://github.com/discourse/discourse_theme) to
watch a local checkout on a disposable development site:

```sh
discourse_theme watch .
```

JavaScript uses Discourse's theme API and category outlets, not replacement core
templates. Mobile avatars are mounted alongside native featured-topic rows, so
Discourse still renders their links, badges, dates, and reply counts. Regular
topic-list and post avatars remain native Discourse behavior.
Keep changes in `common/`, `desktop/`,
`scss/`, and `javascripts/discourse/`; theme QUnit tests live in `test/`.

For linting, use a Node version supported by `package.json` and the pinned pnpm
version:

```sh
pnpm install --frozen-lockfile
pnpm lint
```

After installing the component in a Discourse development checkout, run its
browser tests from that checkout:

```sh
bin/rake "themes:qunit[name,RpNation — Foundation Component]"
```

CI runs linting and Discourse's official theme test workflow. When changing
layout, also check Categories, topic lists, a multi-post topic and its timeline,
the composer, profile/preferences, badges, and full-page chat at desktop and
mobile widths.
