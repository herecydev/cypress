/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require("lodash");
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs-extra"));
const debug = require("debug")("cypress:server:browsers");
const path = require("path");
const urlUtil = require("url");
const FirefoxProfile = require("firefox-profile");
const firefoxUtil = require("./firefox-util");

const plugins = require("../plugins");
const utils = require("./utils");

const defaultPreferences = {
  "network.proxy.type": 1,

  //# necessary for adding extensions
  "devtools.debugger.remote-enabled": true,
  "devtools.debugger.prompt-connection": false,
  // "devtools.debugger.remote-websocket": true
  "devtools.chrome.enabled": true,
  //# http://hg.mozilla.org/mozilla-central/file/1dd81c324ac7/build/automation.py.in//l372
  //# Only load extensions from the application and user profile.
  //# AddonManager.SCOPE_PROFILE + AddonManager.SCOPE_APPLICATION
  "extensions.enabledScopes": 5,
  //# Disable metadata caching for installed add-ons by default.
  "extensions.getAddons.cache.enabled": false,
  //# Disable intalling any distribution add-ons.
  "extensions.installDistroAddons": false,

  "app.normandy.api_url": '',
  //# https://github.com/SeleniumHQ/selenium/blob/master/javascript/firefox-driver/webdriver.json
  "app.update.auto": false,
  "app.update.enabled": false,
  "browser.displayedE10SNotice": 4,
  "browser.download.manager.showWhenStarting": false,
  "browser.EULA.override": true,
  "browser.EULA.3.accepted": true,
  "browser.link.open_external": 2,
  "browser.link.open_newwindow": 2,
  "browser.offline": false,
  "browser.reader.detectedFirstArticle": true,
  "browser.safebrowsing.enabled": false,
  "browser.safebrowsing.malware.enabled": false,
  "browser.search.update": false,
  "browser.selfsupport.url" : "",
  "browser.sessionstore.resume_from_crash": false,
  "browser.shell.checkDefaultBrowser": false,
  "browser.tabs.warnOnClose": false,
  "browser.tabs.warnOnOpen": false,
  "datareporting.healthreport.service.enabled": false,
  "datareporting.healthreport.uploadEnabled": false,
  "datareporting.healthreport.service.firstRun": false,
  "datareporting.healthreport.logging.consoleEnabled": false,
  "datareporting.policy.dataSubmissionEnabled": false,
  "datareporting.policy.dataSubmissionPolicyAccepted": false,
  "datareporting.policy.dataSubmissionPolicyBypassNotification": false,
  "devtools.errorconsole.enabled": true,
  "dom.disable_open_during_load": false,
  "extensions.autoDisableScopes": 10,
  "extensions.blocklist.enabled": false,
  "extensions.checkCompatibility.nightly": false,
  "extensions.logging.enabled": true,
  "extensions.update.enabled": false,
  "extensions.update.notifyUser": false,
  "javascript.enabled": true,
  "network.manage-offline-status": false,
  "network.http.phishy-userpass-length": 255,
  "offline-apps.allow_by_default": true,
  "prompts.tab_modal.enabled": false,
  "security.fileuri.origin_policy": 3,
  "security.fileuri.strict_origin_policy": false,
  "signon.rememberSignons": false,
  "toolkit.networkmanager.disable": true,
  "toolkit.telemetry.prompted": 2,
  "toolkit.telemetry.enabled": false,
  "toolkit.telemetry.rejected": true,
  "xpinstall.signatures.required": false,
  "xpinstall.whitelist.required": false,
  "browser.dom.window.dump.enabled": true,
  "browser.laterrun.enabled": false,
  "browser.newtab.url": "about:blank",
  "browser.newtabpage.enabled": false,
  "browser.startup.page": 0,
  "browser.startup.homepage": "about:blank",
  "browser.startup.homepage_override.mstone": "ignore",
  "browser.usedOnWindows10.introURL": "about:blank",
  "dom.max_chrome_script_run_time": 30,
  "dom.max_script_run_time": 30,
  "dom.report_all_js_exceptions": true,
  "javascript.options.showInConsole": true,
  "network.captive-portal-service.enabled": false,
  "security.csp.enable": false,
  "startup.homepage_welcome_url": "about:blank",
  "startup.homepage_welcome_url.additional": "about:blank",
  "webdriver_accept_untrusted_certs": true,
  "webdriver_assume_untrusted_issuer": true,
  //# prevent going into safe mode after crash
  "toolkit.startup.max_resumed_crashes": -1,
  "geo.provider.testing": true,

  //# allow playing videos w/o user interaction
  "media.autoplay.default": 0,

  "browser.safebrowsing.blockedURIs.enabled": false,
  "browser.safebrowsing.downloads.enabled": false,
  "browser.safebrowsing.passwords.enabled": false,
  "browser.safebrowsing.malware.enabled": false,
  "browser.safebrowsing.phishing.enabled": false,

  //# allow capturing screen through getUserMedia(...)
  //# and auto-accept the permissions prompt
  "media.getusermedia.browser.enabled": true,
  "media.navigator.permission.disabled": true,

  "dom.min_background_timeout_value": 4,
  "dom.timeout.enable_budget_timer_throttling": false

};

module.exports = {
  send: firefoxUtil.send,

  open(browserName, url, options = {}) {
    let ps, ua;
    let extensions = [];
    let preferences = _.extend({}, defaultPreferences);

    debug('firefox open %o', options);

    if (ps = options.proxyServer) {
      let { hostname, port, protocol } = urlUtil.parse(ps);
      if (port == null) { port = protocol === "https:" ? 443 : 80; }
      port = parseFloat(port);

      _.extend(preferences, {
        "network.proxy.allow_hijacking_localhost": true,
        "network.proxy.http": hostname,
        "network.proxy.ssl": hostname,
        "network.proxy.http_port": port,
        "network.proxy.ssl_port": port,
        "network.proxy.no_proxies_on": ""
      });
    }

    if (ua = options.userAgent) {
      preferences["general.useragent.override"] = ua;
    }

    return Promise
    .try(function() {
      if (!plugins.has("before:browser:launch")) { return; }

      return plugins.execute("before:browser:launch", options.browser, { preferences, extensions })
      .then(function(result) {
        debug("got user args for 'before:browser:launch' %o", result);
        if (!result) { return; }

        if (_.isPlainObject(result.preferences)) {
          ({
            preferences
          } = result);
        }

        if (_.isArray(result.extensions)) {
          return extensions = result.extensions;
        }
      });}).then(() => Promise.all([
      utils.ensureCleanCache(browserName),
      utils.writeExtension(options.browser, options.isTextTerminal, options.proxyUrl, options.socketIoRoute, options.onScreencastFrame),
      utils.ensureCleanCache(browserName)
    ])).spread(function(cacheDir, extensionDest, profileDir) {
      extensions.push(extensionDest);

      const profile = new FirefoxProfile({
        destinationDirectory: profileDir
      });
      debug("firefox profile dir %o", { path: profile.path() });

      preferences["browser.cache.disk.parent_directory"] = cacheDir;
      for (let pref in preferences) {
        const value = preferences[pref];
        profile.setPreference(pref, value);
      }
      profile.updatePreferences();

      const args = [
        "-profile",
        profile.path(),
        //# TODO: ensure binding to 127.0.0.1 for RDP and Marionette
        "-marionette",
        "-new-instance",
        "-foreground",
        "-height", "794", //# TODO: why 794?
        "-width", "1280",
        //# TODO: ensure binding to 127.0.0.1 for RDP and Marionette
        "-start-debugger-server", "2929"
      ];

      debug("launch in firefox", { url, args });

      return utils.launch(browserName, null, args);}).then(browserInstance => firefoxUtil.setup(extensions, url)
    .then(() => browserInstance)).catch(function(err) {
      debug("launch error:", err.stack);
      throw err;
    });
  }

};
