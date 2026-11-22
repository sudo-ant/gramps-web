import {afterEach, describe, expect, it, vi} from 'vitest'
import {render} from 'lit'
import '../../src/views/GrampsjsViewSearch.js'

// happy-dom does not implement the ElementInternals used by Material text fields.
vi.mock('@material/web/textfield/outlined-text-field', () => ({}))

afterEach(() => vi.unstubAllGlobals())

async function setup(query = 'I0933') {
  const view = document.createElement('grampsjs-view-search')
  const results = [{handle: 'kenneth', gramps_id: 'I0933'}]
  const apiGet = vi.fn().mockResolvedValue({data: results, total_count: 1})
  view.appState = {apiGet, i18n: {lang: 'en', strings: {}}}
  view._objectTypes = {...view._objectTypes, person: true, family: true}
  view.attachShadow({mode: 'open'})
  render(view.renderContent(), view.shadowRoot, {host: view})
  const field = view.shadowRoot.getElementById('search-field')
  field.value = query
  const input = document.createElement('input')
  field.attachShadow({mode: 'open'}).append(input)
  const button = view.shadowRoot.querySelector('md-icon-button')
  return {view, apiGet, results, field, input, button}
}

function keydown(input, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    composed: true,
    cancelable: true,
    ...options,
  })
  input.dispatchEvent(event)
  return event
}

describe('global search keyboard and icon', () => {
  it.each(['Enter', 'NumpadEnter', ''])(
    'executes once for Enter with code %s',
    async code => {
      vi.stubGlobal('_oldSearchBackend', false)
      const {view, apiGet, results, input} = await setup()
      const event = keydown(input, {code})
      await Promise.resolve()
      expect(event.defaultPrevented).toBe(true)
      expect(apiGet).toHaveBeenCalledOnce()
      expect(apiGet.mock.calls[0][0]).toContain('query=I0933&')
      expect(apiGet.mock.calls[0][0]).toContain('&type=person,family')
      expect(view._data).toEqual(results)
      expect(view._objectTypes.person).toBe(true)
      expect(view._objectTypes.family).toBe(true)
    }
  )

  it.each([false, true])(
    'uses the same query and categories as the icon (legacy=%s)',
    async legacy => {
      vi.stubGlobal('_oldSearchBackend', legacy)
      const {apiGet, input, button, field} = await setup('old query')
      field.value = 'Kenneth Harris'
      keydown(input)
      await Promise.resolve()
      expect(apiGet).toHaveBeenCalledOnce()
      const enterUrl = apiGet.mock.calls[0][0]
      apiGet.mockClear()
      button.click()
      await Promise.resolve()
      expect(apiGet).toHaveBeenCalledOnce()
      expect(apiGet.mock.calls[0][0]).toBe(enterUrl)
      expect(enterUrl).toContain('query=Kenneth Harris')
      expect(enterUrl).toContain(
        legacy ? '(type:person OR type:family)' : '&type=person,family'
      )
    }
  )

  it.each(['enter', 'click'])(
    'clears results without requests for an empty query (%s)',
    async action => {
      const {view, apiGet, input, button, results} = await setup('')
      view._data = results
      view._totalCount = 1
      if (action === 'enter') keydown(input)
      else button.click()
      expect(apiGet).not.toHaveBeenCalled()
      expect(view._data).toEqual([])
      expect(view._totalCount).toBe(-1)
    }
  )

  it('ignores held Enter, composition and other keys', async () => {
    const {apiGet, input} = await setup()
    keydown(input, {repeat: true})
    keydown(input, {isComposing: true})
    keydown(input, {key: 'a', code: 'KeyA'})
    expect(apiGet).not.toHaveBeenCalled()
    keydown(input)
    keydown(input, {repeat: true})
    await Promise.resolve()
    expect(apiGet).toHaveBeenCalledOnce()
  })
})
