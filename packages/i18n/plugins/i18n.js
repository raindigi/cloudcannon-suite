var Vinyl = require("vinyl"),
	PluginError = require("plugin-error"),
	fs = require("fs"),
	c = require("ansi-colors"),
	through = require("through2").obj,
	sortObject = require("sort-object-keys"),
	log = require("fancy-log"),
	cheerio = require("cheerio"),
	crypto = require("crypto"),
	path = require("path");

const REDIRECT_HTML = fs.readFileSync(__dirname + "/redirect-page.html", "utf8");
var IGNORE_URL_REGEX = /^([a-z]+\:|\/\/|\#)/;

function cleanObj(obj) {
	for (var prop in obj) {
		if (!obj[prop]) {
			delete obj[prop];
		}
	}
}

function getBaseFolder(sitePath) {
	return sitePath.replace(/^\/+/, "").split(path.sep).shift();
}

function generateDefaultI18nKey($, $el) {
	var outerHTML = $.html($el);
	return crypto.createHash("sha256").update(outerHTML).digest("base64").replace(/=+$/, "");
}

function handleHTMLFile(options) {
	options = options || {};
	return through(function (file, encoding, callback) {
		if (file.isNull()) {
			return callback(null, file);
		}
		if (file.isStream()) {
			return callback(new PluginError("local-ejs", "Streaming not supported"));
		}

		file.sitePath = "/" + file.path.substring(file.base.length);
		file.sitePath = file.sitePath.replace(/\/index.html?/i, "/").replace(/\/+/i, "/");

		if (options.skipFile && options.skipFile(file)) {
			log("Skipping HTML " + c.grey("'" + file.sitePath + "'"));
			return callback();
		}

		var $ = cheerio.load(file.contents.toString(encoding), { lowerCaseAttributeNames:false, decodeEntities: false });

		$("[data-i18n]").each(function processElement() {
			var $el = $(this),
				key = $el.attr("data-i18n"),
				attributes = $el.attr("data-i18n-attrs");

			if (!key) {
				key = generateDefaultI18nKey($, $el);
			}

			attributes = attributes ? attributes.split(",") : [];
			attributes.map(function (attr) { return attr.trim(); });

			options.processElement.apply(this, [file, $el, key, attributes, $]);
		});

		if (options.rewriteLinks) {
			$("a[href]:not([preserve-link]), link[href]:not([preserve-link])").each(function processLink() {
				var $el = $(this),
					href = $el.attr("href"),
					updated = href && options.rewriteLinks.apply(this, [file, href]);

				if (updated) {
					$el.attr("href", updated);
				}
			});
			$("meta[http-equiv='refresh']").each(function processLink() {
				var $el = $(this),
					content = $el.attr("content"),
					parts = content.split(";");

				for (var i = 0; i < parts.length; i++) {
					if (parts[i].indexOf("url=") === 0) {
						var href = parts[i].substring(4),
							updated = options.rewriteLinks.apply(this, [file, href]);

						if (updated) {
							parts[i] = "url=" + updated;
							$el.attr("content", parts.join(";"));
						}
						return;
					}
				}
			});
		}

		if (options.completeFile) {
			options.completeFile.apply(this, [file, $]);
		}

		callback();
	}, options.complete);
}

module.exports = {
	generate: function (options) {
		options = options || {};
		var locale = {};

		return handleHTMLFile({
			processElement: function (file, $el, key, attributes) {
				var additions = {};

				additions[key] = $el.html();
				attributes.forEach(function (attr) {
					additions[key + "." + attr] = $el.attr(attr) || "";
				});

				for (var newKey in additions) {
					if (additions.hasOwnProperty(newKey)) {
						if (locale[newKey] && locale[newKey] !== additions[newKey]) {
							log(c.yellow("Duplicate data-i18n") + " "
								+ c.grey(newKey));
						} else {
							locale[newKey] = additions[newKey];
						}
					}
				}
			},
			complete: function (callback) {
				var sorted = sortObject(locale);
				cleanObj(sorted);

				this.push(new Vinyl({
					path: "source.json",
					contents: Buffer.from(JSON.stringify(sorted, null, "\t"))
				}));

				log(c.green("Generation complete") + " "
					+ c.grey("i18n/source.json")
					+ " available with " + Object.keys(sorted).length + " keys");

				callback();
			}
		});
	},

	translate: function (options) {
		options = options || {};
		var targetLocale = options.targetLocale,
			locale = options.locales[targetLocale],
			localeNames = options.localeNames;

		var localeLookup = {};
		for (var i = 0; i < localeNames.length; i++) {
			localeLookup[localeNames[i]] = true;
		}

		return handleHTMLFile({
			skipFile: function (file) {
				var baseFolder = getBaseFolder(file.sitePath);

				return !!localeLookup[baseFolder];
			},
			rewriteLinks: function rewriteLinks(file, href) {
				if (!href || IGNORE_URL_REGEX.test(href)) {
					return;
				}

				var baseFolder = getBaseFolder(href);
				if (localeLookup[baseFolder]) {
					log("Skipping link " + c.grey("'" + href + "'"));
					return;
				}

				var parsed = path.parse(href);

				if (parsed.ext && parsed.ext.indexOf(".htm") !== 0) {
					return;
				}

				var parts = href.replace(/^\/+/, "").split("/");
				parts.unshift(targetLocale);

				var updated = "/" + parts.join("/");
				return updated.replace(/\/+/g, "/");
			},
			processElement: function (file, $el, key, attributes) {
				if (!locale) {
					return; // Default locale case
				}

				if (locale[key]) {
					$el.html(locale[key].wrappedTranslation || locale[key].translation);
					locale[key].count++;
				} else if ($el.html()) {
					log(c.yellow("Missing translation") + " "
						+ c.grey(targetLocale + file.sitePath) +
						" [data-i18n=" + key + "]");
				}

				attributes.forEach(function (attr) {
					if (locale[key + "." + attr]) {
						$el.attr(attr, locale[key + "." + attr].translation);
						locale[key + "." + attr].count++;
					} else if ($el.attr(attr)) {
						log(c.yellow("Missing translation") + " "
							+ c.grey(targetLocale + file.sitePath) +
							" [data-i18n=" + key + "][" + attr + "]");
					}
				});
			},
			completeFile: function (file, $) {
				$("html").attr("lang", targetLocale);
				$("meta[http-equiv='content-language']").remove();
				$("head").append('<meta http-equiv="content-language" content="' + targetLocale + '">\n');
				localeNames.forEach(function (localeName) {
					if (localeName != targetLocale) {
						var redirectUrl = localeName + file.sitePath;
						$("head").append('<link rel="alternate" href="/' + redirectUrl + '" hreflang="' + localeName + '">\n');
					}
				});

				file.contents = Buffer.from($.html());
				this.push(file);
			}
		});
	},

	redirectPage: function (options) {
		options = options || {};

		var defaultLocale = options.defaultLocale,
			localeNames = options.localeNames;

		var localeLookup = {};
		for (var i = 0; i < localeNames.length; i++) {
			localeLookup[localeNames[i]] = true;
		}


		var redirectLookup = {};

		localeNames.forEach(function (localeName) {
			var match = localeName.toLowerCase().match(/[a-z]+/gi);
			var language = match[0], country = match[1];

			redirectLookup[language] = localeName;
			if (country) {
				redirectLookup[language + "-" + country] = localeName;
				redirectLookup[language + "_" + country] = localeName;
			}

			redirectLookup[localeName] = localeName;
		});

		return through(function (file, encoding, callback) {
			if (file.isNull()) {
				return callback(null, file);
			}

			if (file.isStream()) {
				return callback(new PluginError("local-ejs", "Streaming not supported"));
			}

			file.sitePath = "/" + file.path.substring(file.base.length);
			file.sitePath = file.sitePath.replace(/\/index.html?/i, "/").replace(/\/+/i, "/");

			var baseFolder = getBaseFolder(file.sitePath);
			if (file.sitePath === "/404.html" || localeLookup[baseFolder]) {
				return callback();
			}

			var html = REDIRECT_HTML
				.replace(/ALTERNATES/g, localeNames.map(function (targetLocale) {
					if (targetLocale !== defaultLocale) {
						return '<link rel="alternate" href="/' + targetLocale + file.sitePath + '" hreflang="' + targetLocale + '">';
					}
					return '';
				}).join(""))
				.replace(/SITE_PATH/g, file.sitePath)
				.replace(/DEFAULT_LANGUAGE/g, defaultLocale)
				.replace(/LOCALE_LOOKUP/g, JSON.stringify(redirectLookup));

			file.contents = Buffer.from(html);
			this.push(file);
			callback();
		});
	}
};
