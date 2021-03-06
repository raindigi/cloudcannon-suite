---
title: Setup
package: I18n
order_number: 2
---
### Tagging content

First, tag each HTML element you need to translate by adding a `data-i18n` attribute with a unique key. For example:

```html
<h1 data-i18n="welcome-message">Hello, welcome to my website</h1>
<p data-i18n="intro-text">Please enjoy the following static content...</p>
```

### Locales

Run `gulp i18n:generate` to generate a lookup table, called a "locale", for these keys. The locale determines the content to be shown for each `data-i18n` key.

This generated locale is saved at `i18n/source.json`.

```json
{
  "welcome-message": "Hello, welcome to my website",
  "intro-text": "Please enjoy the following static content..."
}
```

Using the generated locale as a template, you can create your own alternative locales which provide different (i.e. translated) content for each of the tagged HTML elements. Each new locale should: 
* be put in a `i18n/locales` directory (by default)
* use a `.json` file format
* be named after the target language (e.g. `fr.json` for French)

For example:
* `i18n/locales/de.json`
```json
{"welcome_message": "Hallo, herzlich willkommen auf meiner Website"}
```
* `i18n/locales/es.json`
```json
{"welcome_message": "Hola, bienvenido a mi página web"}
```

When you run `gulp i18n`, translated versions of the site are built using these locales. They are served under a baseurl matching the name of the locale - for example, an English version of the site will be served at `localhost:8000/en/`, while a Spanish version will simultaneously be served at `localhost:8000/es/`.

### Gulp setup

To use this package, your `gulpfile.js` needs the following:

```js
const gulp = require("gulp");
const suite = require("@cloudcannon/suite");

suite.i18n(gulp);
```

### Usage

```bash
$ gulp i18n
```

### Subtasks

#### build

```bash
$ gulp i18n:build
```

#### serve

Runs a local webserver on the `dest` folder

```bash
$ gulp i18n:serve
```

#### watch

Watches the `src` and `locale_src` folder to trigger builds

```bash
$ gulp i18n:watch
```

#### legacy-transfer

```bash
$ gulp i18n:legacy-transfer
```

#### generate

Generates the default locale at `i18n/source.json`. This is not run as part of the `gulp i18n` command.

```bash
$ gulp i18n:generate
```

#### load-locales

```bash
$ gulp i18n:load-locales
```

#### clean

```bash
$ gulp i18n:clean
```

#### clone-assets

```bash
$ gulp i18n:clone-assets
```

#### translate-html-pages

```bash
$ gulp i18n:translate-html-pages
```

#### clone-prelocalised-html-pages

```bash
$ gulp i18n:clone-prelocalised-html-pages
```