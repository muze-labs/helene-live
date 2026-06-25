const LANGUAGES = new Map([
  ['html', 'html'],
  ['markup', 'html'],
  ['css', 'css'],
  ['js', 'javascript'],
  ['javascript', 'javascript']
])

const VOID_HTML = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

const DEFAULT_OPTIONS = {
  selector: '[data-muze-example], muze-live-example',
  updateDelay: 250,
  scriptType: 'module',
  useHelene: true
}

export function enhanceLiveExamples(options = {}) {
  options = { ...DEFAULT_OPTIONS, ...options }
  const root = options.root || document

  wrapLooseExampleSources(root)

  const examples = root.matches?.(options.selector)
    ? [root]
    : Array.from(root.querySelectorAll(options.selector))

  return examples
    .filter(example => !example.muzeLiveExample)
    .map(example => {
      example.muzeLiveExample = new LiveExample(example, options)
      return example.muzeLiveExample
    })
}

export class LiveExample {
  constructor(example, options = {}) {
    this.example = example
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.previewWindow = null
    this.previewCheck = null
    this.lastGoodPreview = ''
    this.textareas = new Map()

    this.setupFields()
    this.setupPreview()
    this.setupEvents()
    this.update()
  }

  setupFields() {
    this.example.classList.add('mle')

    this.expandSourceBlocks()

    const fields = Array.from(this.example.querySelectorAll(
      'textarea[data-example], textarea[data-helene-language], template[data-example], script[type="text/plain"][data-example]'
    ))

    for (const source of fields) {
      const language = getLanguage(source)
      if (!language) continue

      const textarea = toTextarea(source)
      textarea.dataset.example = language
      textarea.dataset.heleneLanguage = heleneLanguage(language)
      textarea.spellcheck = false

      this.textareas.set(language, textarea)
      wrapField(textarea, language)
      this.enhanceEditor(textarea, language)
    }
  }

  expandSourceBlocks() {
    const sources = Array.from(this.example.querySelectorAll('[data-muze-example-source]'))

    for (const source of sources) {
      const sections = parseExampleSource(readSourceText(source), source.dataset.exampleLanguage)
      const fragment = document.createDocumentFragment()

      for (const [language, code] of Object.entries(sections)) {
        const textarea = document.createElement('textarea')
        textarea.dataset.example = language
        textarea.value = trimOuterNewline(code)
        fragment.append(textarea)
      }

      source.replaceWith(fragment)
    }
  }

  enhanceEditor(textarea, language) {
    const helene = this.options.helene || globalThis.helene
    if (!this.options.useHelene || !helene) return

    // Helene currently falls back to eval() for JS validation when Acorn is not
    // available. We keep the editor safe by disabling Helene's HTML/JS language
    // module in that case; this component still validates JS with new Function().
    const needsSafeParser = language === 'javascript' || language === 'html'
    const originalLanguage = textarea.dataset.heleneLanguage
    if (needsSafeParser && !globalThis.acorn) {
      delete textarea.dataset.heleneLanguage
    }

    try {
      helene({ textarea, validate: Boolean(globalThis.acorn) })
    } catch (error) {
      console.warn('muze-live-example: Helene enhancement failed', error)
      textarea.dataset.heleneLanguage = originalLanguage
    }
  }

  setupPreview() {
    this.controls = document.createElement('div')
    this.controls.className = 'mle-controls'

    this.status = document.createElement('span')
    this.status.className = 'mle-status'
    this.status.setAttribute('role', 'status')

    this.openButton = document.createElement('button')
    this.openButton.type = 'button'
    this.openButton.className = 'mle-open'
    this.openButton.textContent = 'Open preview'

    this.controls.append(this.status, this.openButton)

    this.errors = document.createElement('ul')
    this.errors.className = 'mle-errors'
    this.errors.hidden = true

    this.preview = document.createElement('div')
    this.preview.className = 'mle-preview'

    this.iframe = document.createElement('iframe')
    this.iframe.className = 'mle-frame'
    this.iframe.sandbox = 'allow-scripts'
    this.iframe.title = this.example.dataset.title || 'Live example preview'

    this.preview.append(this.iframe)
    this.example.append(this.controls, this.errors, this.preview)
  }

  setupEvents() {
    for (const textarea of this.textareas.values()) {
      textarea.addEventListener('input', () => this.scheduleUpdate())
    }

    this.openButton.addEventListener('click', () => {
      if (this.previewWindow && !this.previewWindow.closed) {
        this.previewWindow.close()
        this.restoreInlinePreview()
      } else {
        this.openExternalPreview()
      }
    })
  }

  scheduleUpdate() {
    clearTimeout(this.pendingUpdate)
    this.pendingUpdate = setTimeout(() => this.update(), this.options.updateDelay)
  }

  update() {
    const files = this.getFiles()
    const validation = validateFiles(files)

    this.showValidation(validation)

    if (!validation.ok) return

    this.lastGoodPreview = buildPreviewDocument(files, {
      title: this.example.dataset.title || 'Live example',
      scriptType: this.example.dataset.scriptType || this.options.scriptType
    })

    this.renderPreview(this.lastGoodPreview)
  }

  getFiles() {
    return {
      html: this.textareas.get('html')?.value || '',
      css: this.textareas.get('css')?.value || '',
      javascript: this.textareas.get('javascript')?.value || ''
    }
  }

  showValidation(validation) {
    for (const [language, textarea] of this.textareas) {
      textarea.setAttribute('aria-invalid', validation.errors.some(error => error.language === language) ? 'true' : 'false')
    }

    if (validation.ok) {
      this.errors.hidden = true
      this.errors.innerHTML = ''
      this.status.textContent = this.previewWindow && !this.previewWindow.closed
        ? 'Preview opened in separate window.'
        : 'Preview updated.'
      this.example.classList.remove('mle-has-errors')
      return
    }

    this.example.classList.add('mle-has-errors')
    this.status.textContent = 'Preview paused until syntax errors are fixed.'
    this.errors.hidden = false
    this.errors.innerHTML = validation.errors
      .map(error => `<li><strong>${label(error.language)}</strong>: ${escapeHTML(error.message)}</li>`)
      .join('')
  }

  renderPreview(html) {
    if (this.previewWindow && !this.previewWindow.closed && this.previewWindow.setPreview) {
      this.previewWindow.setPreview(html)
    } else if (!this.example.dataset.previewExternal) {
      this.iframe.srcdoc = html
    }
  }

  openExternalPreview() {
    const name = this.example.dataset.windowName || `muze-preview-${Math.random().toString(36).slice(2)}`
    const opened = window.open('', name, 'popup,width=900,height=700')
    if (!opened) {
      this.status.textContent = 'Could not open preview window. The browser may have blocked it.'
      return
    }

    this.previewWindow = opened
    opened.document.open()
    opened.document.write(buildPreviewWindow(this.lastGoodPreview || buildPreviewDocument(this.getFiles())))
    opened.document.close()

    this.example.dataset.previewExternal = 'true'
    this.openButton.textContent = 'Close preview window'
    this.status.textContent = 'Preview opened in separate window.'

    clearInterval(this.previewCheck)
    this.previewCheck = setInterval(() => {
      if (!this.previewWindow || this.previewWindow.closed) {
        this.restoreInlinePreview()
      }
    }, 500)
  }

  restoreInlinePreview() {
    clearInterval(this.previewCheck)
    this.previewCheck = null
    this.previewWindow = null
    delete this.example.dataset.previewExternal
    this.openButton.textContent = 'Open preview'
    this.status.textContent = 'Inline preview restored.'
    if (this.lastGoodPreview) this.iframe.srcdoc = this.lastGoodPreview
  }
}

export function parseExampleSource(source, defaultLanguage = '') {
  const fallbackLanguage = normalizeLanguage(defaultLanguage)
  const lines = trimOuterNewline(source).split('\n')
  const sections = {}
  let currentLanguage = fallbackLanguage
  let currentLines = []
  let sawMarker = false

  for (const line of lines) {
    const marker = line.match(/^\s*---\s*([a-zA-Z][\w-]*)\s*$/)

    if (marker) {
      const language = normalizeLanguage(marker[1])
      if (language) {
        sawMarker = true
        commitSection(sections, currentLanguage, currentLines)
        currentLanguage = language
        currentLines = []
        continue
      }
    }

    currentLines.push(line)
  }

  commitSection(sections, currentLanguage, currentLines)

  if (!sawMarker && fallbackLanguage) return sections
  return Object.fromEntries(Object.entries(sections).filter(([, code]) => code.trim()))
}

export function validateFiles(files) {
  const errors = []

  if (files.html.trim()) {
    errors.push(...validateHTML(files.html).map(message => ({ language: 'html', message })))
  }

  if (files.css.trim()) {
    errors.push(...validateCSS(files.css).map(message => ({ language: 'css', message })))
  }

  if (files.javascript.trim()) {
    const error = validateJavaScript(files.javascript)
    if (error) errors.push({ language: 'javascript', message: error })
  }

  return { ok: errors.length === 0, errors }
}

export function validateJavaScript(source) {
  try {
    if (globalThis.acorn) {
      globalThis.acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true
      })
    } else {
      Function(source)
    }
    return null
  } catch (error) {
    if (error.loc) return `${error.message} at line ${error.loc.line}, column ${error.loc.column + 1}`
    return error.message
  }
}

export function validateHTML(source) {
  const errors = []
  const stack = []
  const tagRE = /<!--[^]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?>/g
  let match

  while ((match = tagRE.exec(source))) {
    const raw = match[0]
    const name = match[1]?.toLowerCase()
    if (!name || raw.startsWith('<!--') || raw.startsWith('<!')) continue
    if (VOID_HTML.has(name) || raw.endsWith('/>')) continue

    const position = positionOf(source, match.index)
    if (raw.startsWith('</')) {
      const top = stack.pop()
      if (!top) {
        errors.push(`Unexpected closing </${name}> at line ${position.line}, column ${position.column}.`)
      } else if (top.name !== name) {
        errors.push(`Expected </${top.name}> before </${name}> at line ${position.line}, column ${position.column}.`)
      }
    } else {
      stack.push({ name, position })
    }
  }

  while (stack.length) {
    const item = stack.pop()
    errors.push(`Missing </${item.name}> for tag opened at line ${item.position.line}, column ${item.position.column}.`)
  }

  return errors
}

export function validateCSS(source) {
  const errors = []
  const stack = []
  let quote = ''
  let comment = false
  let escaped = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (comment) {
      if (char === '*' && next === '/') {
        comment = false
        i++
      }
      continue
    }

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '/' && next === '*') {
      comment = true
      i++
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '{' || char === '(' || char === '[') {
      stack.push({ char, position: positionOf(source, i) })
    } else if (char === '}' || char === ')' || char === ']') {
      const open = stack.pop()
      if (!open || !matches(open.char, char)) {
        const position = positionOf(source, i)
        errors.push(`Unexpected ${char} at line ${position.line}, column ${position.column}.`)
      }
    }
  }

  if (comment) errors.push('Unclosed CSS comment.')
  if (quote) errors.push('Unclosed CSS string.')

  while (stack.length) {
    const open = stack.pop()
    errors.push(`Missing ${closingFor(open.char)} for ${open.char} opened at line ${open.position.line}, column ${open.position.column}.`)
  }

  return errors
}

export function buildPreviewDocument(files, options = {}) {
  const title = escapeHTML(options.title || 'Live example')
  const scriptType = options.scriptType || 'module'
  const css = files.css ? `<style>\n${escapeEndTag(files.css, 'style')}\n</style>` : ''
  const script = files.javascript
    ? `<script type="${escapeAttribute(scriptType)}">\n${escapeEndTag(files.javascript, 'script')}\n</script>`
    : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${css}
</head>
<body>
${files.html || ''}
${script}
</body>
</html>`
}

function wrapLooseExampleSources(root) {
  const sources = root.matches?.('[data-muze-example-source]')
    ? [root]
    : Array.from(root.querySelectorAll?.('[data-muze-example-source]') || [])

  for (const source of sources) {
    if (source.closest(DEFAULT_OPTIONS.selector)) continue

    const wrapper = document.createElement('div')
    wrapper.dataset.muzeExample = ''
    if (source.dataset.title) wrapper.dataset.title = source.dataset.title
    source.before(wrapper)
    wrapper.append(source)
  }
}

function buildPreviewWindow(previewHTML) {
  const previewJSON = JSON.stringify(previewHTML).replaceAll(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview</title>
<style>
html, body { height: 100%; margin: 0; }
iframe { width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe id="preview" sandbox="allow-scripts"></iframe>
<script>
const preview = document.getElementById('preview')
window.setPreview = html => { preview.srcdoc = html }
window.setPreview(${previewJSON})
</script>
</body>
</html>`
}

function readSourceText(source) {
  if (source.tagName === 'TEMPLATE') return source.content.textContent
  return source.textContent
}

function commitSection(sections, language, lines) {
  if (!language) return
  const value = trimOuterNewline(lines.join('\n'))
  if (sections[language]) {
    sections[language] += '\n' + value
  } else {
    sections[language] = value
  }
}

function normalizeLanguage(language) {
  return LANGUAGES.get(String(language || '').toLowerCase())
}

function getLanguage(source) {
  const value = source.dataset.example || source.dataset.heleneLanguage || ''
  return normalizeLanguage(value)
}

function heleneLanguage(language) {
  return language === 'javascript' ? 'javascript' : language
}

function toTextarea(source) {
  if (source.tagName === 'TEXTAREA') return source

  const textarea = document.createElement('textarea')
  for (const attribute of source.attributes) {
    if (attribute.name !== 'type') textarea.setAttribute(attribute.name, attribute.value)
  }
  textarea.value = trimOuterNewline(source.tagName === 'TEMPLATE'
    ? source.content.textContent
    : source.textContent)
  source.replaceWith(textarea)
  return textarea
}

function wrapField(textarea, language) {
  if (textarea.closest('.mle-field')) return

  const wrapper = document.createElement('div')
  wrapper.className = 'mle-field'
  wrapper.dataset.language = language

  const fieldLabel = document.createElement('div')
  fieldLabel.className = 'mle-label'
  fieldLabel.textContent = textarea.dataset.label || label(language)

  textarea.before(wrapper)
  wrapper.append(fieldLabel, textarea)
}

function label(language) {
  return language === 'javascript' ? 'JavaScript' : language.toUpperCase()
}

function trimOuterNewline(value) {
  return String(value || '').replace(/^\n/, '').replace(/\n$/, '')
}

function matches(open, close) {
  return (open === '{' && close === '}') ||
    (open === '(' && close === ')') ||
    (open === '[' && close === ']')
}

function closingFor(open) {
  return { '{': '}', '(': ')', '[': ']' }[open]
}

function positionOf(source, index) {
  const before = source.slice(0, index).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1 }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll('"', '&quot;')
}

function escapeEndTag(value, tag) {
  return String(value).replaceAll(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
}
