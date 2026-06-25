---
title: "Live examples in Hugo"
---

Add the CSS and module once in your Hugo base template:

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

Copy `hugo/layouts/_markup/render-codeblock-example.html` into the same path in your Hugo site, then author examples like this:

````markdown
```example {title="Greeting button"}
--- html
<button id="hello">Say hello</button>

--- css
button {
  font: inherit;
}

--- js
document.querySelector('#hello').addEventListener('click', () => {
  document.body.insertAdjacentHTML('beforeend', '<p>Hello!</p>')
})
```
````

Single-pane examples use the same syntax:

````markdown
```example {title="HTML only"}
--- html
<p>Hello <strong>world</strong>.</p>
```
````

The optional file `hugo/render-codeblock-single-language.example.html` shows how to support this shorthand:

````markdown
```html {example=true title="HTML only"}
<p>Hello <strong>world</strong>.</p>
```
````
