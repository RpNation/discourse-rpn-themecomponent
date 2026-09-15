# RpNation — Foundation Component

A **Discourse theme component for Foundation**, the default Discourse theme. It
adds RpNation's linen appearance and forum layout while leaving Foundation
and Discourse core responsible for the underlying interface. It is not a
standalone theme and no longer requires Graceful.

## Features

- Palette-aware linen background, inset sidebar, and centered content panel.
- A spacious logo band above the compact navigation, sized separately for desktop
  and mobile. The logo scrolls away while navigation stays available.
- Adjustable site and topic/post widths.
- A persistent Full width toggle in the sidebar footer, including topic posts
  and consistent padding when the sidebar is closed.
- A sidebar palette selector with separate light/dark choices and native
  Auto, Light, and Dark appearance modes.
- One topic with the newest activity from each category's native previews on
  desktop and mobile, with last-poster avatars, topic status, unread badges, and dates.
- Compact category rows, aligned color strips, section header bars, and two-line
  latest activity with date and author on desktop and mobile.
- All-time category totals with native unread/new badges, without weekly rates.
- Hidden sidebar Tags section.
- Collapsible category-section headings for any category ID, with saved browser preferences.
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
5. The component displays one topic per row on desktop and mobile. Keep
   **Number of topics shown on the categories page** at its native default of
   `3` so the component can select the newest activity from those previews. A
   value of `1` displays that one native preview.
6. Optionally add your own category sections in the component settings below.

The component selects one topic from Discourse's native featured topics before
rows first render on desktop or mobile. It keeps the server's topic arrays,
Topic objects, last-poster avatars, and unread data intact. Parent rows include
the descendant topics Discourse attaches to them, even when the parent has no
direct topics. Missing topic category IDs do not discard those previews.

The native category response is the only data source. The component makes no
supplemental topic requests and never replaces a preview with a later lookup's
topic or avatar. A genuinely new native category response is reflected normally.
There is no request queue, retry UI, or companion plugin.

Selection uses activity time, without preferring pins. It follows Discourse's
permissions, cache, and each user's dismissed-pin behavior. It can only choose
among topics included in the native response: if pins fill all previews or a
custom category sort omits newer activity, the selected preview is not guaranteed
to be the newest topic in the entire category. Category description topics and
unlisted topics are excluded from selection.

Use a current Discourse release with Foundation and the
`category-list-latest-wrapper` outlet and the `addModelGetter` API. The getter
selects the topic before native rows render. This component is developed against
Discourse core `c9d27d5d2e` (2026-09-15). The model API and native preview behavior
are also verified against beta's `9cccc5837d` (2026-09-11); compatibility with other older
releases and parent themes is not guaranteed. Surfaces and text follow the selected
Discourse palette, including light and dark mode. Configure your preferred
light/dark palettes on the parent theme; this component does not replace them.

### Sidebar controls

**Full width** expands the forum and topic posts while keeping the sidebar,
timeline, and page gutters aligned. Its setting is remembered in this browser.

**Color palettes** lists the site's user-selectable palettes, subject to the
parent theme's palette restrictions. Enable palettes for users in the site's
appearance settings to make them available. Choose separate light and dark
palettes, then choose **Auto**, **Light**, or **Dark**. Auto follows the device's
appearance preference. Choices use Discourse's native per-browser cookies for
both visitors and signed-in users; account preferences on other devices are
unchanged. Failed stylesheet downloads leave the previous palette in place.

This selector is integrated into the component and requires no separate palette
component. It uses the current light/dark model rather than the older API used by
the [Sidebar Color Palette Toggle reference](https://meta.discourse.org/t/sidebar-color-palette-toggle/373184).

### Site logo

Upload the full RpNation logo under **Admin → Appearance → Logo**. The branding
band preserves its proportions, with a default maximum height of 110 pixels on
desktop and 56 pixels on phones. A 436 × 110 logo fits at its original
size on desktop. Larger uploads scale to the available space without cropping.
The site's mobile and dark logo variants are supported, and clicking the logo
returns to the homepage.

The band scrolls above the sticky navigation. Full-page chat includes the logo
band at a compact height that adapts to the window, preserving space for messages
and reply boxes.

## Component settings

| Setting               | Default | Purpose                                                                                        |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `site_max_width`      | `1280`  | Main site content maximum in pixels; Discourse adds the sidebar alongside it. Range: 960–1920. |
| `topic_content_width` | `900`   | Topic/post content maximum in pixels, subject to available viewport space. Range: 640–1200.    |
| `desktop_logo_height` | `110`   | Maximum logo height above navigation on desktop, in pixels. Range: 48–200.                     |
| `mobile_logo_height`  | `56`    | Maximum logo height above navigation on phones, in pixels. Range: 32–96.                       |
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

Click a section header or its arrow to collapse all its category rows and nested
subforums through the next header. Each section remembers its choice in this
browser's local storage, separately for signed-in accounts and anonymous visitors.
Saved choices apply before the rows display on desktop and mobile. Collapsing
keeps the native topic previews mounted, so expanding does not reload them.

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
Discourse still renders their title links, badges, and reply counts; the component
adds the linked latest date and author beneath the title. Regular
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
