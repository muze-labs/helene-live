# Muze live example

Small live HTML/CSS/JavaScript examples for documentation pages.

The editor layer is deliberately thin: this module enhances ordinary `textarea` elements with Helene when Helene is available, then renders the latest valid example into a sandboxed iframe. The previous preview stays visible if the user introduces a syntax error.

## Include once

```html
<link rel="stylesheet" href="/lib/helene/helene.css">
<link rel="stylesheet" href="/lib/muze-live-example/muze-live-example.css">

<script type="module">
  import * as acorn from '/lib/acorn/acorn.mjs'
  globalThis.acorn = acorn

  import '/lib/simplyflow/flow.mjs'
  import helene from '/lib/helene/helene.mjs'
  import { enhanceLiveExamples } from '/lib/muze-live-example/muze-live-example.mjs'

  enhanceLiveExamples({ helene })
</script>
```

Acorn is recommended when using Helene with JavaScript examples. At the moment Helene falls back to `eval()` for JavaScript validation when Acorn is missing; this wrapper disables Helene's HTML/JS language module in that case, but loading Acorn gives you highlighting and validation without executing editor code.

## Author an example in HTML

```html
<div data-muze-example data-title="Counter button">
  <textarea data-example="html"><button id="count">Clicked 0 times</button></textarea>

  <textarea data-example="css">button {
  font: inherit;
  padding: .5rem .75rem;
}</textarea>

  <textarea data-example="javascript">let clicks = 0
const button = document.querySelector('#count')
button.addEventListener('click', () => {
  clicks += 1
  button.textContent = `Clicked ${clicks} times`
})</textarea>
</div>
```

Only include the panes you need. HTML-only, CSS-only, HTML+CSS, and HTML+JS examples all work.

## Author an example in Markdown with Hugo

Copy the render hook from:

```text
hugo/layouts/_markup/render-codeblock-example.html
```

to the same path in your Hugo site. Then write one fenced block:

````markdown
```example {title="Counter button"}
--- html
<button id="count">Clicked 0 times</button>

--- css
button {
  font: inherit;
  padding: .5rem .75rem;
}

--- js
let clicks = 0
const button = document.querySelector('#count')
button.addEventListener('click', () => {
  clicks += 1
  button.textContent = `Clicked ${clicks} times`
})
```
````

The section marker must be alone on a line and can be `--- html`, `--- css`, `--- js`, or `--- javascript`.

For a single-pane example, you may still use the same format:

````markdown
```example {title="Plain HTML"}
--- html
<p>Hello <strong>world</strong>.</p>
```
````

There is also an optional generic render-hook recipe in:

```text
hugo/render-codeblock-single-language.example.html
```

That lets you write:

````markdown
```html {example=true title="Plain HTML"}
<p>Hello <strong>world</strong>.</p>
```
````

Use that only if you are comfortable installing or merging a generic `render-codeblock.html` hook, because it affects all fenced code blocks.

## Preview window

The `Open preview` button opens a separate preview window. While that window is open, the inline preview is hidden. Closing the window restores the inline preview.

User code runs inside a sandboxed iframe both inline and in the external preview window.

## Validation

The preview updates only when all present panes pass lightweight checks:

- JavaScript: Acorn when loaded, otherwise `Function(source)` syntax checking.
- HTML: simple tag-balance checks for mismatched or missing closing tags.
- CSS: simple bracket, string, and comment balance checks.

This intentionally avoids a large parser dependency in the live-example layer. For stricter validation, pass a custom wrapper around this module or load a parser in the documentation site.
