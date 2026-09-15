import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import Logo from "discourse/components/header/logo";
import { apiInitializer } from "discourse/lib/api";
import getURL from "discourse/lib/get-url";
import { wantsNewWindow } from "discourse/lib/intercept-click";
import { applyValueTransformer } from "discourse/lib/transformer";
import DiscourseURL from "discourse/lib/url";

class RpnMasthead extends Component {
  @service session;
  @service site;
  @service siteSettings;

  measureLayout = modifier((element) => {
    const style = document.documentElement.style;
    const properties = [
      "--rpn-sticky-navigation-height",
      "--rpn-masthead-height",
    ];
    const previous = properties.map((name) => style.getPropertyValue(name));
    let header;
    const measure = () => {
      if (header) {
        const top = parseFloat(getComputedStyle(header).top) || 0;
        style.setProperty(
          properties[0],
          `${header.getBoundingClientRect().height + top}px`
        );
      }
      style.setProperty(
        properties[1],
        `${element.getBoundingClientRect().height}px`
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The sibling header is inserted in the same render as this outlet.
    const frame = requestAnimationFrame(() => {
      header = document.querySelector(".d-header-wrap");
      if (header) {
        observer.observe(header);
      }
      measure();
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      properties.forEach((name, index) => {
        if (previous[index]) {
          style.setProperty(name, previous[index]);
        } else {
          style.removeProperty(name);
        }
      });
    };
  });

  get href() {
    return applyValueTransformer("home-logo-href", getURL("/"));
  }

  @action
  navigate(event) {
    if (wantsNewWindow(event)) {
      return;
    }

    event.preventDefault();
    DiscourseURL.routeToTag(event.currentTarget);
  }

  get logoName() {
    return this.site.mobileView && this.resolveLogo("mobile_logo")
      ? "mobile_logo"
      : "logo";
  }

  get logoUrl() {
    return this.resolveLogo(this.logoName);
  }

  get darkLogoUrl() {
    return this.resolveLogo(this.logoName, this.session.darkModeAvailable);
  }

  resolveLogo(name, dark) {
    const lightUrl = this.siteSettings[`site_${name}_url`] || "";
    const darkUrl = this.siteSettings[`site_${name}_dark_url`];
    const url = dark
      ? darkUrl
      : this.session.defaultColorSchemeIsDark
        ? darkUrl || lightUrl
        : lightUrl;

    return applyValueTransformer("home-logo-image-url", url, { name, dark });
  }

  <template>
    <div class="rpn-masthead" {{this.measureLayout}}>
      <div class="wrap rpn-masthead__inner">
        <a
          class="rpn-masthead__link"
          href={{this.href}}
          {{on "click" this.navigate}}
        >
          {{#if this.logoUrl}}
            <Logo
              @url={{this.logoUrl}}
              @darkUrl={{this.darkLogoUrl}}
              @title={{this.siteSettings.title}}
              @key="rpn-masthead__logo"
            />
          {{else}}
            <span class="text-logo">{{this.siteSettings.title}}</span>
          {{/if}}
        </a>
      </div>
    </div>
  </template>
}

export default apiInitializer((api) => {
  // Keep the outer home-logo-wrapper available for native mobile chat controls.
  // The logo itself is rendered only once, above the sticky navigation.
  api.renderInOutlet("above-site-header", RpnMasthead);
  api.renderInOutlet("home-logo", <template></template>);
});
