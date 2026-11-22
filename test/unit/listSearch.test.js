import {describe, it, expect, vi} from 'vitest'
import {render} from 'lit'
import '../../src/views/GrampsjsViewPeople.js'
import '../../src/views/GrampsjsViewFamilies.js'
import '../../src/views/GrampsjsViewEvents.js'
import '../../src/views/GrampsjsViewPlaces.js'
import '../../src/views/GrampsjsViewSources.js'
import '../../src/views/GrampsjsViewCitations.js'
import {GrampsjsViewSearch} from '../../src/views/GrampsjsViewSearch.js'

describe('list search entry', () => {
  for (const page of [
    'people',
    'families',
    'events',
    'places',
    'sources',
    'citations',
  ]) {
    it.each([false, true])(
      `${page}: opens global search (canEdit=%s)`,
      canEdit => {
        const view = document.createElement(`grampsjs-view-${page}`)
        view.appState = {
          permissions: {canEdit},
          i18n: {strings: {Search: 'Find'}},
        }
        view._page = 3
        view._sort = '+gramps_id'
        const nav = vi.fn()
        view.addEventListener('nav', nav)
        const container = document.createElement('div')
        render(view._renderFilter(), container)
        const button = container.querySelector(
          'md-outlined-button[slot="leading"]'
        )
        expect(button.textContent.trim()).toBe('Find')
        expect(button.hasAttribute('disabled')).toBe(false)
        button.click()
        expect(nav).toHaveBeenCalledOnce()
        expect(nav.mock.calls[0][0].detail).toEqual({path: 'search'})
        expect(nav.mock.calls[0][0].bubbles).toBe(true)
        expect(nav.mock.calls[0][0].composed).toBe(true)
        expect(view._page).toBe(3)
        expect(view._sort).toBe('+gramps_id')
        expect(container.querySelector('grampsjs-filters')).not.toBeNull()
      }
    )
  }
})

describe('existing global search', () => {
  it.each(['Florence Harris', 'I0340'])(
    'passes %s to the existing search API',
    async query => {
      const view = document.createElement('grampsjs-view-search')
      const apiGet = vi.fn().mockResolvedValue({data: [], total_count: 0})
      view.appState = {apiGet, i18n: {lang: 'en', strings: {}}}
      view.attachShadow({mode: 'open'})
      const field = document.createElement('input')
      field.id = 'search-field'
      field.value = query
      view.shadowRoot.append(field)
      window._oldSearchBackend = false
      GrampsjsViewSearch.prototype._executeSearch.call(view)
      await Promise.resolve()
      expect(apiGet).toHaveBeenCalledOnce()
      expect(apiGet.mock.calls[0][0]).toContain(`/api/search/?query=${query}&`)
      expect(apiGet.mock.calls[0][0]).toContain(
        'profile=all&page=1&pagesize=20'
      )
    }
  )
})
