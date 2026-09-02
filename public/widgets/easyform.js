/*!
 * EasyForm embed loader — paste-and-go widget for embedding published forms.
 *
 * Two ways to use it:
 *
 *   1. Declarative (recommended): add a script tag with data-form-id
 *        <script src="https://your-domain.com/widgets/easyform.js"
 *                data-form-id="YOUR_FORM_ID" data-height="640" async></script>
 *      The loader replaces itself with a responsive iframe that renders the
 *      form widget and auto-resizes as the form content changes.
 *
 *   2. Programmatic:
 *        <div id="my-form"></div>
 *        <script src="https://your-domain.com/widgets/easyform.js" async></script>
 *        <script>
 *          window.EasyForm.mount(document.getElementById("my-form"), "FORM_ID", {
 *            height: 640,
 *          });
 *        </script>
 *
 * The widget origin is derived from this script's own src, so it works on any
 * deployment (localhost, Vercel, custom domain) without configuration.
 */
(function () {
  "use strict";

  var WIDGET_PATH = "/widgets/form.html";
  var RESIZE_EVENT = "easyform:resize";

  // Resolve the deployment origin from this script's src attribute. Falls back
  // to the current page origin if the attribute is missing (rare).
  function resolveOrigin() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf("/widgets/easyform.js") !== -1) {
        var m = src.match(/^([a-z]+:\/\/[^/]+)/i);
        if (m) return m[1];
      }
    }
    return window.location.origin;
  }

  function mount(container, formId, options) {
    if (!container || !formId) throw new Error("EasyForm.mount requires a container and form id");
    options = options || {};
    var origin = resolveOrigin();
    var height = options.height || 640;

    var iframe = document.createElement("iframe");
    iframe.setAttribute("src", origin + WIDGET_PATH + "?form=" + encodeURIComponent(formId));
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("title", "Embedded form");
    iframe.setAttribute("loading", "lazy");
    iframe.style.border = "0";
    iframe.style.width = "100%";
    iframe.style.height = height + "px";
    iframe.style.overflow = "hidden";
    iframe.style.display = "block";
    iframe.style.maxWidth = "100%";
    container.appendChild(iframe);

    function onMessage(event) {
      // Only trust messages from this exact iframe.
      if (event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || typeof data !== "object" || data.type !== RESIZE_EVENT) return;
      var h = Number(data.height);
      if (Number.isFinite(h) && h > 0 && h <= 20000) {
        iframe.style.height = h + "px";
      }
    }

    if (window.addEventListener) window.addEventListener("message", onMessage, false);
    return iframe;
  }

  // Declarative usage: <script data-form-id="..."> replaces itself.
  function initDeclarative() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var script = scripts[i];
      var formId = script.getAttribute("data-form-id");
      if (!formId) continue;

      // The script already has an adjacent container in some setups; otherwise
      // create one.
      var container = document.createElement("div");
      container.className = "easyform-widget";
      script.parentNode.insertBefore(container, script);
      var height = parseInt(script.getAttribute("data-height") || "640", 10);
      mount(container, formId, { height: isNaN(height) ? 640 : height });
    }
  }

  // Expose a tiny public API, but never clobber an existing instance.
  window.EasyForm = window.EasyForm || {};
  window.EasyForm.mount = window.EasyForm.mount || mount;
  window.EasyForm.version = "1.0.0";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeclarative);
  } else {
    initDeclarative();
  }
})();
