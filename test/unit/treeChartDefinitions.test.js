import {render} from 'lit'
import {describe, it, expect, vi} from 'vitest'
import {
  chartDataUrl,
  chartDefinitions,
  chartSettingValues,
  familyTreeCompletionUrl,
  mergePeopleByHandle,
} from '../../src/views/treeChartDefinitions.js'
import {GrampsjsViewTree} from '../../src/views/GrampsjsViewTree.js'
import {chartNameDisplayFormat} from '../../src/util.js'
import {TREE_VIEWS} from '../../src/treeDefaults.js'

const rulesOf = url =>
  JSON.parse(decodeURIComponent(/rules=([^&]*)/.exec(url)[1]))

const extendOf = url => /extend=([^&]*)/.exec(url)[1]

const family = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({ref, frel: 'Birth', mrel: 'Birth'})),
})

const person = (
  handle,
  {grampsId = handle, parentFamily, families = []} = {}
) => ({
  handle,
  gramps_id: grampsId,
  extended: {
    primary_parent_family: parentFamily,
    families,
  },
})

const handlesOf = url =>
  url ? decodeURIComponent(/handles=([^&]*)/.exec(url)[1]).split(',') : []

describe('chart definitions', () => {
  it('defines Family Tree with independent product defaults', () => {
    expect(chartDefinitions.family).toBeDefined()
    expect(chartSettingValues(chartDefinitions.family)).toEqual({
      ancestors: 4,
      descendants: 1,
      nameDisplayFormat: chartNameDisplayFormat.givenThenSurname,
    })
    expect(
      chartDefinitions.family.settings.map(setting => setting.key)
    ).toEqual([
      'familyTreeChartAnc',
      'familyTreeChartDesc',
      'familyTreeChartNameDisplayFormat',
    ])
  })

  it('reads setting values from the user settings, with defaults', () => {
    const values = chartSettingValues(chartDefinitions.hourglass, {
      hourglassChartDesc: 4,
    })
    expect(values).toEqual({
      ancestors: 2,
      descendants: 4,
      nameDisplayFormat: chartNameDisplayFormat.surnameThenGiven,
    })
  })

  it('fetches one more generation than the settings count', () => {
    const {family, ancestor, descendant, hourglass, fan} = chartDefinitions
    const generations = (definition, settings) =>
      rulesOf(
        chartDataUrl(
          definition,
          'I1',
          chartSettingValues(definition, settings),
          'en'
        )
      ).rules.map(rule => rule.values)
    expect(generations(family, {})).toEqual([
      ['I1', 5],
      ['I1', 2],
    ])
    expect(generations(ancestor, {treeChartAnc: 5})).toEqual([
      ['I1', 6],
      ['I1', 2],
    ])
    expect(generations(descendant, {descendantChartDesc: 3})).toEqual([
      ['I1', 2],
      ['I1', 4],
    ])
    expect(generations(hourglass, {})).toEqual([
      ['I1', 3],
      ['I1', 2],
    ])
    expect(generations(fan, {})).toEqual([
      ['I1', 5],
      ['I1', 2],
    ])
  })

  it('renders Family Tree with effective depths and runtime properties', () => {
    const container = document.createElement('div')
    const data = [{handle: 'P'}]
    const appState = {settings: {}}
    const values = chartSettingValues(chartDefinitions.family)

    render(
      chartDefinitions.family.render({
        grampsId: 'I1',
        values,
        data,
        canEdit: true,
        appState,
      }),
      container
    )

    const chart = container.querySelector('grampsjs-family-tree-chart')
    expect(chart).not.toBeNull()
    expect(chart.grampsId).toBe('I1')
    expect(chart.nAnc).toBe(5)
    expect(chart.nDesc).toBe(2)
    expect(chart.viewportTopInset).toBe(128)
    expect(chart.nameDisplayFormat).toBe(
      chartNameDisplayFormat.givenThenSurname
    )
    expect(chart.canEdit).toBe(true)
    expect(chart.data).toBe(data)
    expect(chart.appState).toBe(appState)
  })

  it('fetches Family Tree people with family-aware extensions', () => {
    const url = chartDataUrl(
      chartDefinitions.family,
      'I1',
      chartSettingValues(chartDefinitions.family),
      'en'
    )

    expect(extendOf(url)).toBe(
      'event_ref_list,primary_parent_family,family_list'
    )
  })

  it('requests unresolved focal and descendant partners exactly once', () => {
    const focalFamily1 = family('F1', 'R', 'P1', ['C'])
    const focalFamily2 = family('F2', 'R', 'P2')
    const focalFamily3 = family('F3', 'R', 'P3')
    const repeatedPartnerFamily = family('F4', 'R', 'P2')
    const childFamily = family('FC', 'C', 'CP')
    const data = [
      person('R', {
        grampsId: 'I1',
        families: [
          focalFamily1,
          focalFamily2,
          focalFamily3,
          repeatedPartnerFamily,
        ],
      }),
      person('C', {families: [childFamily]}),
      person('P1'),
    ]

    const url = familyTreeCompletionUrl(
      data,
      'I1',
      {ancestors: 0, descendants: 1},
      'de'
    )

    expect(new Set(handlesOf(url))).toEqual(new Set(['P2', 'P3', 'CP']))
    expect(handlesOf(url)).toHaveLength(3)
    expect(url).toContain('locale=de')
    expect(url).toContain('profile=self')
    expect(extendOf(url)).toBe(
      'event_ref_list,primary_parent_family,family_list'
    )
  })

  it('requests an unresolved ancestor at the current model boundary', () => {
    const parents = family('FP', 'F', 'M', ['R'])
    const grandparents = family('FG', 'GF', 'GM', ['F'])
    const data = [
      person('R', {grampsId: 'I1', parentFamily: parents}),
      person('F', {parentFamily: grandparents}),
      person('M'),
    ]

    const url = familyTreeCompletionUrl(
      data,
      'I1',
      {ancestors: 1, descendants: 0},
      'en'
    )

    // The existing filter counts the focal person, while the Family Tree
    // model currently creates ancestor nodes through ancestors + 1.
    expect(handlesOf(url)).toEqual(['GF', 'GM'])
  })

  it('does not request people when every displayed person is loaded', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const data = [
      person('R', {grampsId: 'I1', families: [focalFamily]}),
      person('P'),
      person('C'),
    ]

    expect(
      familyTreeCompletionUrl(data, 'I1', {ancestors: 0, descendants: 0}, 'en')
    ).toBe('')
  })

  it('does not traverse the ancestry of a fetched partner', () => {
    const focalFamily = family('F1', 'R', 'P')
    const partnerParents = family('FPP', 'PF', 'PM', ['P'])
    const data = [
      person('R', {grampsId: 'I1', families: [focalFamily]}),
      person('P', {parentFamily: partnerParents}),
    ]

    expect(
      familyTreeCompletionUrl(data, 'I1', {ancestors: 2, descendants: 0}, 'en')
    ).toBe('')
  })

  it("requests unresolved partners from an ancestor's side families", () => {
    const primary = family('FGV', 'G', 'H', ['V'])
    const firstSide = family('FG1', 'G', 'P1')
    const secondSide = family('FG2', 'G', 'P2')
    const data = [
      person('V', {grampsId: 'I1', parentFamily: primary}),
      person('G', {families: [primary, firstSide, secondSide]}),
      person('H', {families: [primary]}),
    ]

    const url = familyTreeCompletionUrl(
      data,
      'I1',
      {ancestors: 1, descendants: 0},
      'en'
    )

    expect(new Set(handlesOf(url))).toEqual(new Set(['P1', 'P2']))
  })

  it("does not request an ancestor side partner's ancestry after completion", () => {
    const primary = family('FGV', 'G', 'H', ['V'])
    const side = family('FG1', 'G', 'P1')
    const partnerParents = family('FPP', 'PF', 'PM', ['P1'])
    const data = [
      person('V', {grampsId: 'I1', parentFamily: primary}),
      person('G', {families: [primary, side]}),
      person('H', {families: [primary]}),
      person('P1', {parentFamily: partnerParents, families: [side]}),
    ]

    expect(
      familyTreeCompletionUrl(data, 'I1', {ancestors: 2, descendants: 0}, 'en')
    ).toBe('')
  })

  it('merges returned people by handle without replacing initial records', () => {
    const initialRoot = person('R', {grampsId: 'I1'})
    const duplicateRoot = {...initialRoot, extra: 'completion'}
    const partner = person('P')

    expect(
      mergePeopleByHandle(
        [initialRoot],
        [duplicateRoot, partner, partner, {handle: ''}]
      )
    ).toEqual([initialRoot, partner])
  })

  it('fetches people by degree of separation with all parent families for the relationship chart', () => {
    const {relationship} = chartDefinitions
    const url = chartDataUrl(
      relationship,
      'I1',
      chartSettingValues(relationship, {relationshipChartAnc: 3}),
      'de'
    )
    expect(rulesOf(url).rules).toEqual([
      {name: 'DegreesOfSeparation', values: ['I1', 3]},
    ])
    expect(extendOf(url)).toBe(
      'event_ref_list,primary_parent_family,family_list,parent_family_list'
    )
    expect(url).toContain('locale=de')
  })

  it('only allows adding people to the charts that have cards', () => {
    const editable = Object.entries(chartDefinitions)
      .filter(([, definition]) => definition.editable)
      .map(([name]) => name)
    expect(editable).toEqual([
      'family',
      'ancestor',
      'descendant',
      'hourglass',
      'relationship',
    ])
  })
})

// Returns a promise with its resolve function
function deferred() {
  let resolvePromise
  const promise = new Promise(resolve => {
    resolvePromise = resolve
  })
  return {promise, resolve: resolvePromise}
}

function makeView(settings = {}) {
  const view = new GrampsjsViewTree()
  const apiGet = vi.fn()
  view.appState = {settings, i18n: {lang: 'en'}, apiGet}
  view.grampsId = 'I1'
  return {view, apiGet}
}

describe('GrampsjsViewTree', () => {
  function useFamilyTree(view) {
    view._currentTabId = TREE_VIEWS.indexOf('family')
  }

  it('fetches again only when the request changes', () => {
    const settings = {}
    const {view, apiGet} = makeView(settings)
    apiGet.mockReturnValue(new Promise(() => {}))
    view._fetchIfNeeded()
    view._fetchIfNeeded()
    expect(apiGet).toHaveBeenCalledTimes(1)
    settings.treeChartNameDisplayFormat = 'Given Surname'
    view._fetchIfNeeded()
    expect(apiGet).toHaveBeenCalledTimes(1)
    settings.treeChartAnc = 6
    view._fetchIfNeeded()
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('records each selected person in the history, also the first one', () => {
    const {view} = makeView()
    // The first person is selected before the view is first updated
    view.willUpdate(new Map())
    view.grampsId = 'I2'
    view.willUpdate(new Map())
    expect(view._history).toEqual(['I1', 'I2'])
    view._prevPerson()
    view.willUpdate(new Map())
    expect(view.grampsId).toBe('I1')
    expect(view._history).toEqual(['I1'])
  })

  it('requests Family Tree data for a newly selected focal person', async () => {
    const {view, apiGet} = makeView()
    useFamilyTree(view)
    apiGet.mockReturnValue(new Promise(() => {}))

    await view._selectPerson({detail: {grampsId: 'I2'}})
    view._fetchIfNeeded()

    expect(view.grampsId).toBe('I2')
    expect(rulesOf(apiGet.mock.calls[0][0]).rules).toEqual([
      {name: 'IsLessThanNthGenerationAncestorOf', values: ['I2', 5]},
      {name: 'IsLessThanNthGenerationDescendantOf', values: ['I2', 2]},
    ])
  })

  it('marks only the Family Tree chart area for right-side overlays', () => {
    const {view} = makeView()
    view.appState.i18n.strings = {}
    view.appState.permissions = {canEdit: false}
    view.renderTabs = () => ''
    view.renderControls = () => ''
    view.renderChart = () => ''
    view.renderSelectedPerson = () => ''
    const container = document.createElement('div')

    useFamilyTree(view)
    render(view.renderContent(), container)
    expect(container.querySelector('.family-tree-chart-area')).not.toBeNull()

    view._currentTabId = TREE_VIEWS.indexOf('ancestor')
    render(view.renderContent(), container)
    expect(container.querySelector('.family-tree-chart-area')).toBeNull()
  })

  it('does not pass people fetched for one chart to another', () => {
    const {view, apiGet} = makeView()
    apiGet.mockReturnValue(new Promise(() => {}))
    view.willUpdate(new Map())
    view._data = [{handle: 'A'}]
    view._fetchIfNeeded()
    view._currentTabId = TREE_VIEWS.indexOf('relationship')
    view.willUpdate(new Map())
    expect(view._data).toEqual([])
    view._fetchIfNeeded()
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('shows the previous person while the selected person is loading', () => {
    const {view} = makeView()
    view._data = [
      {gramps_id: 'I1', profile: {name_given: 'Ann', name_surname: 'Lee'}},
    ]
    view.willUpdate(new Map())
    view.grampsId = 'I2'
    view.willUpdate(new Map())
    expect(view._selectedPerson.gramps_id).toBe('I1')
    view._data = [{gramps_id: 'I2', profile: {name_given: 'Bo'}}]
    view.willUpdate(new Map())
    expect(view._selectedPerson.gramps_id).toBe('I2')
  })

  it('opens the page of the shown person while the selected person is loading', () => {
    const {view} = makeView()
    view._data = [{gramps_id: 'I1', profile: {name_given: 'Ann'}}]
    view.willUpdate(new Map())
    view.grampsId = 'I2'
    view.willUpdate(new Map())
    const paths = []
    view.addEventListener('nav', e => paths.push(e.detail.path))
    view._goToPerson()
    expect(paths).toEqual(['person/I1'])
  })

  describe('viewport keys', () => {
    const keyEvent = (
      key,
      {target = document.body, path, ...modifiers} = {}
    ) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...modifiers,
      composedPath: () => path ?? [target],
      preventDefault: vi.fn(),
    })

    function makeKeyView() {
      const {view} = makeView()
      view.active = true
      const viewport = {
        zoomBy: vi.fn(),
        panBy: vi.fn(),
        fit: vi.fn(),
        centreRoot: vi.fn(),
      }
      view._chartViewport = () => viewport
      return {view, viewport}
    }

    it('zooms, moves and fits the chart', () => {
      const {view, viewport} = makeKeyView()
      for (const key of ['+', '=', '-', 'ArrowRight', 'ArrowUp', '0']) {
        view._handleChartKey(keyEvent(key))
      }
      expect(viewport.zoomBy.mock.calls.map(([factor]) => factor)).toEqual([
        1.25, 1.25, 0.8,
      ])
      expect(viewport.panBy.mock.calls.map(([dx, dy]) => [dx, dy])).toEqual([
        [-100, 0],
        [0, 100],
      ])
      expect(viewport.fit).toHaveBeenCalledOnce()
    })

    it('leaves keys with modifiers, in fields, tabs and menus alone', () => {
      const {view, viewport} = makeKeyView()
      const input = document.createElement('input')
      // Only the tag name of the chart switcher matters
      const tabs = {tagName: 'GRAMPSJS-PILL-TOGGLE'}
      const events = [
        keyEvent('+', {ctrlKey: true}),
        keyEvent('-', {metaKey: true}),
        keyEvent('+', {target: input}),
        keyEvent('ArrowLeft', {path: [document.body, tabs]}),
      ]
      for (const event of events) {
        view._handleChartKey(event)
        expect(event.preventDefault).not.toHaveBeenCalled()
      }
      expect(viewport.zoomBy).not.toHaveBeenCalled()
      expect(viewport.panBy).not.toHaveBeenCalled()
    })

    it('leaves keys alone while the view is not active', () => {
      const {view, viewport} = makeKeyView()
      view.active = false
      view._handleChartKey(keyEvent('+'))
      expect(viewport.zoomBy).not.toHaveBeenCalled()
    })

    it('has no viewport for the fan chart', () => {
      const {view} = makeView()
      view._currentTabId = TREE_VIEWS.indexOf('fan')
      expect(view._chartViewport()).toBeUndefined()
    })

    it('finds the Family Tree viewport', () => {
      const {view} = makeView()
      const viewport = {}
      const querySelector = vi.fn(() => ({viewport}))
      Object.defineProperty(view, 'renderRoot', {
        value: {querySelector},
      })
      view._currentTabId = TREE_VIEWS.indexOf('family')

      expect(view._chartViewport()).toBe(viewport)
      expect(querySelector).toHaveBeenCalledWith(
        '#chart grampsjs-family-tree-chart, #chart grampsjs-tree-chart, #chart grampsjs-relationship-chart'
      )
    })
  })

  it('ignores a response that arrives after a newer request was sent', async () => {
    const {view, apiGet} = makeView()
    const first = deferred()
    const second = deferred()
    apiGet
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    view._fetchIfNeeded()
    view.grampsId = 'I2'
    view._fetchIfNeeded()
    second.resolve({data: [{handle: 'B'}]})
    first.resolve({data: [{handle: 'A'}]})
    await Promise.all([first.promise, second.promise])
    await Promise.resolve()
    expect(view._data).toEqual([{handle: 'B'}])
    expect(view.loading).toBe(false)
  })

  it('does not make a completion request when Family Tree data is complete', async () => {
    const {view, apiGet} = makeView()
    useFamilyTree(view)
    apiGet.mockResolvedValue({data: [person('R', {grampsId: 'I1'})]})

    view._fetchIfNeeded()
    await vi.waitFor(() => expect(view.loading).toBe(false))

    expect(apiGet).toHaveBeenCalledOnce()
    expect(view._data).toEqual([person('R', {grampsId: 'I1'})])
  })

  it('fetches and merges unresolved Family Tree people', async () => {
    const {view, apiGet} = makeView()
    useFamilyTree(view)
    const focalFamily = family('F1', 'R', 'P')
    const root = person('R', {grampsId: 'I1', families: [focalFamily]})
    const partner = person('P')
    apiGet
      .mockResolvedValueOnce({data: [root]})
      .mockResolvedValueOnce({data: [root, partner]})

    view._fetchIfNeeded()
    await vi.waitFor(() => expect(view.loading).toBe(false))

    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(handlesOf(apiGet.mock.calls[1][0])).toEqual(['P'])
    expect(view._data).toEqual([root, partner])
  })

  it('keeps an omitted completion person as a placeholder without retrying', async () => {
    const {view, apiGet} = makeView()
    useFamilyTree(view)
    const focalFamily = family('F1', 'R', 'P')
    const root = person('R', {grampsId: 'I1', families: [focalFamily]})
    apiGet
      .mockResolvedValueOnce({data: [root]})
      .mockResolvedValueOnce({data: []})

    view._fetchIfNeeded()
    await vi.waitFor(() => expect(view.loading).toBe(false))

    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(view._data).toEqual([root])
  })

  it.each(['person', 'settings'])(
    'ignores stale Family Tree completion data after %s changes',
    async change => {
      const settings = {}
      const {view, apiGet} = makeView(settings)
      useFamilyTree(view)
      const focalFamily = family('F1', 'R', 'P')
      const firstRoot = person('R', {
        grampsId: 'I1',
        families: [focalFamily],
      })
      const completion = deferred()
      const currentRoot =
        change === 'person'
          ? person('R2', {grampsId: 'I2'})
          : person('R', {grampsId: 'I1'})
      apiGet
        .mockResolvedValueOnce({data: [firstRoot]})
        .mockReturnValueOnce(completion.promise)
        .mockResolvedValueOnce({data: [currentRoot]})

      view._fetchIfNeeded()
      await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))
      if (change === 'person') {
        view.grampsId = 'I2'
      } else {
        settings.familyTreeChartAnc = 5
      }
      view._fetchIfNeeded()
      await vi.waitFor(() => expect(view._data).toEqual([currentRoot]))
      completion.resolve({data: [person('P')]})
      await completion.promise
      await Promise.resolve()

      expect(apiGet).toHaveBeenCalledTimes(3)
      expect(view._data).toEqual([currentRoot])
      expect(view.loading).toBe(false)
    }
  )
})
