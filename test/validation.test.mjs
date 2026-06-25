import assert from 'node:assert/strict'
import test from 'node:test'
import { validateFiles, validateHTML, validateCSS, validateJavaScript, buildPreviewDocument, parseExampleSource, hasOnlyJavaScript } from '../muze-live-example.mjs'

test('parses multi-section example source', () => {
  assert.deepEqual(parseExampleSource(`--- html
<button>Click</button>

--- css
button { color: red; }

--- js
console.log('ready')
`), {
    html: '<button>Click</button>',
    css: 'button { color: red; }',
    javascript: "console.log('ready')"
  })
})

test('parses single-language example source', () => {
  assert.deepEqual(parseExampleSource('<p>Hello</p>', 'html'), {
    html: '<p>Hello</p>'
  })
})

test('ignores unsupported section markers as code', () => {
  assert.deepEqual(parseExampleSource(`--- html
<p>Before</p>
--- php
<p>After</p>
`), {
    html: '<p>Before</p>\n--- php\n<p>After</p>'
  })
})

test('validates balanced HTML', () => {
  assert.deepEqual(validateHTML('<section><p>Hello</p></section>'), [])
  assert.ok(validateHTML('<section><p>Hello</section>').length >= 1)
})

test('validates CSS bracket balance', () => {
  assert.deepEqual(validateCSS('button { color: red; }'), [])
  assert.equal(validateCSS('button { color: red; ').length, 1)
})

test('validates JavaScript syntax without executing it', () => {
  assert.equal(validateJavaScript('const a = 1'), null)
  assert.match(validateJavaScript('const ='), /Unexpected|identifier|token/i)
})

test('validates all present files', () => {
  assert.equal(validateFiles({ html: '<p>x</p>', css: '', javascript: 'let x = 1' }).ok, true)
  assert.equal(validateFiles({ html: '<p>x', css: '', javascript: 'let x = 1' }).ok, false)
})

test('builds sandbox preview document', () => {
  const html = buildPreviewDocument({ html: '<main>Hello</main>', css: 'body{}', javascript: 'console.log(1)' })
  assert.match(html, /<style>/)
  assert.match(html, /<script type="module">/)
  assert.match(html, /<main>Hello<\/main>/)
})


test('can inject a console bridge into the preview document', () => {
  const html = buildPreviewDocument(
    { html: '', css: '', javascript: 'console.log(1)' },
    { captureConsole: true, consoleId: 'test-console' }
  )
  assert.match(html, /data-muze-console-bridge/)
  assert.match(html, /window\.parent\.postMessage/)
  assert.match(html, /muzeLiveExampleConsole/)
  assert.match(html, /test-console/)
  assert.match(html, /<\/script>\s*<script type="module">/)
  assert.doesNotMatch(html, /<\\\/script>/)
})

test('does not inject a console bridge unless requested', () => {
  const html = buildPreviewDocument({ html: '', css: '', javascript: 'console.log(1)' })
  assert.doesNotMatch(html, /muzeLiveExampleConsole/)
})


test('detects JavaScript-only examples', () => {
  assert.equal(hasOnlyJavaScript(new Map([['javascript', {}]])), true)
  assert.equal(hasOnlyJavaScript(new Map([['javascript', {}], ['html', {}]])), false)
})
