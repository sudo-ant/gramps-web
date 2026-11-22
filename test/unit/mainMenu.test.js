import {describe, expect, it, vi} from 'vitest'
import {render} from 'lit'
import '../../src/components/GrampsjsMainMenu.js'
import '../../src/components/GrampsjsSettingsMenu.js'

// happy-dom lacks the ElementInternals used by these Material containers.
vi.mock('@material/web/list/list', () => ({}))
vi.mock('@material/web/menu/menu', () => ({}))

function setup({
  page = 'home',
  permissions = {},
  hideDNALink = false,
  chat = false,
} = {}) {
  const menu = document.createElement('grampsjs-main-menu')
  menu.appState = {
    path: {page},
    permissions,
    frontendConfig: {hideDNALink},
    dbInfo: {server: {chat}},
    i18n: {strings: {}},
  }
  const container = document.createElement('div')
  const update = () => render(menu.render(), container, {host: menu})
  update()
  return {menu, container, update}
}

const links = container =>
  [...container.querySelectorAll('md-list-item')].map(item =>
    item.getAttribute('href')
  )

describe('family navigation', () => {
  it.each([false, true])(
    'shows the same six primary links (editor=%s)',
    canEdit => {
      const {container} = setup({permissions: {canEdit}})
      const primary = container.querySelector('nav')
      expect(links(primary)).toEqual([
        '/',
        '/tree',
        '/people',
        '/families',
        '/places',
        '/medialist',
      ])
      expect(
        [...primary.querySelectorAll('md-list-item')].map(item =>
          item.textContent.trim()
        )
      ).toEqual([
        'Home',
        'Family Tree',
        'People',
        'Families',
        'Places',
        'Media',
      ])
      expect(primary.getAttribute('aria-label')).toBe('Primary navigation')
      const details = container.querySelector('details')
      expect(details.open).toBe(false)
      expect(details.firstElementChild.tagName).toBe('SUMMARY')
      expect(details.firstElementChild.textContent).toBe('More tools')
      expect(details.querySelector('nav').getAttribute('aria-label')).toBe(
        'More tools'
      )
    }
  )

  it('keeps every existing secondary destination and adds direct list links', () => {
    const {container} = setup({
      permissions: {canViewPrivate: true, canUseChat: true},
      chat: true,
    })
    expect(links(container.querySelector('details'))).toEqual([
      '/events',
      '/sources',
      '/citations',
      '/repositories',
      '/notes',
      '/blog',
      '/timeline',
      '/map',
      '/dna-matches',
      '/chat',
      '/recent',
      '/bookmarks',
      '/tasks',
      '/reports',
      '/export',
      '/revisions',
      '/notifications',
    ])
  })

  it.each([
    'events',
    'sources',
    'citations',
    'repositories',
    'notes',
    'timeline',
    'map',
    'blog',
    'bookmarks',
    'tasks',
    'reports',
    'export',
    'recent',
    'notifications',
    'revisions',
    'revision',
    'dna-matches',
    'dna-chromosome',
    'ydna',
    'chat',
  ])('reveals secondary navigation for the existing %s route', page => {
    const {container} = setup({page})
    expect(container.querySelector('details').open).toBe(true)
  })

  it('updates selection and reveals secondary navigation when the route changes', () => {
    const {menu, container, update} = setup({page: 'people'})
    expect(container.querySelector('[selected]').getAttribute('href')).toBe(
      '/people'
    )
    menu.appState = {...menu.appState, path: {page: 'sources'}}
    update()
    expect(container.querySelector('details').open).toBe(true)
    expect(container.querySelector('[selected]').getAttribute('href')).toBe(
      '/sources'
    )
  })

  it('retains feature and revision permission checks', () => {
    const {container} = setup({
      hideDNALink: true,
      permissions: {canUseChat: true},
      chat: false,
    })
    expect(links(container)).not.toContain('/dna-matches')
    expect(links(container)).not.toContain('/chat')
    expect(links(container)).not.toContain('/revisions')
  })

  it('preserves notifications and translated disclosure labels', () => {
    const {menu, container, update} = setup()
    menu.unreadCount = 3
    menu.appState.i18n.strings = {'More tools': 'More translated'}
    update()
    expect(container.querySelector('summary').textContent).toBe(
      'More translated'
    )
    expect(container.querySelector('.unread-badge').textContent.trim()).toBe(
      '3'
    )
  })

  it.each([false, true])(
    'retains administrative access checks (admin=%s)',
    canManageUsers => {
      const menu = document.createElement('grampsjs-settings-menu')
      menu.appState = {
        permissions: {canManageUsers},
        frontendConfig: {},
        i18n: {strings: {}},
      }
      const container = document.createElement('div')
      render(menu.render(), container, {host: menu})
      expect(
        !!container.querySelector('[href="/settings/administration"]')
      ).toBe(canManageUsers)
      expect(!!container.querySelector('[href="/settings/users"]')).toBe(
        canManageUsers
      )
      expect(container.querySelector('[href="/settings/user"]')).not.toBeNull()
    }
  )
})
