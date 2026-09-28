import {beforeEach, describe, expect, it, vi} from 'vitest'

import {GrampsjsFamilyTreeChart} from '../../src/components/GrampsjsFamilyTreeChart.js'

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  layoutFamilyTree: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../../src/charts/FamilyTreeChart.js', () => ({
  FamilyTreeChart: class FamilyTreeChart {
    constructor() {
      this.node = document.createElement('svg')
      this.clear = mocks.clear
      this.update = mocks.update
    }
  },
}))

vi.mock('../../src/charts/layout/familyTreeLayout.js', () => ({
  layoutFamilyTree: mocks.layoutFamilyTree,
}))

vi.mock('../../src/charts/util.js', () => ({
  chartTransitionDuration: () => 321,
  getImageUrl: (person, size) => `${person.handle}:${size}`,
}))

const changed = (...names) => new Map(names.map(name => [name, undefined]))

describe('GrampsjsFamilyTreeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to four ancestor generations and one descendant generation', () => {
    const element = new GrampsjsFamilyTreeChart()

    expect(element.nAnc).toBe(4)
    expect(element.nDesc).toBe(1)
  })

  it('resolves the Gramps ID and passes both depths to the layout', () => {
    const element = new GrampsjsFamilyTreeChart()
    const graph = {
      personByGrampsId: vi.fn(() => ({handle: 'person-handle'})),
    }
    const layout = {nodes: []}
    mocks.layoutFamilyTree.mockReturnValue(layout)
    element._graph = graph
    element.grampsId = 'I0001'
    element.nAnc = 3
    element.nDesc = 2

    expect(element._computeLayout()).toBe(layout)
    expect(graph.personByGrampsId).toHaveBeenCalledWith('I0001')
    expect(mocks.layoutFamilyTree).toHaveBeenCalledWith(
      graph,
      'person-handle',
      {ancestorDepth: 3, descendantDepth: 2}
    )
  })

  it('passes person-card and runtime options to the renderer', () => {
    const element = new GrampsjsFamilyTreeChart()
    const layout = {nodes: []}
    element._layout = layout
    element.containerWidth = 900
    element.containerHeight = 600
    element.nameDisplayFormat = 1
    element.canEdit = true

    element._drawChart()

    expect(mocks.update).toHaveBeenCalledWith(
      layout,
      expect.objectContaining({
        bboxWidth: 900,
        bboxHeight: 600,
        nameDisplayFormat: 1,
        canEdit: true,
        duration: 321,
      })
    )
    const options = mocks.update.mock.calls[0][1]
    expect(options.getImageUrl({person: {handle: 'P'}})).toBe('P:100')
  })

  it('retains the current layout while a missing selected person is fetched', () => {
    const element = new GrampsjsFamilyTreeChart()
    const layout = {nodes: [{handle: 'old'}]}
    element._layout = layout
    element._graph = {personByGrampsId: vi.fn(() => undefined)}

    element.willUpdate(changed('grampsId'))

    expect(element._layout).toBe(layout)
  })

  it('clears the layout and renderer when new data confirms no person', () => {
    const element = new GrampsjsFamilyTreeChart()
    element._layout = {nodes: [{handle: 'old'}]}
    element.data = []

    element.willUpdate(changed('data'))
    element.updated()

    expect(element._layout).toBeNull()
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['nAnc', 'nDesc'])(
    'recomputes the layout when %s changes',
    property => {
      const element = new GrampsjsFamilyTreeChart()
      const layout = {nodes: []}
      element._graph = {
        personByGrampsId: vi.fn(() => ({handle: 'person-handle'})),
      }
      mocks.layoutFamilyTree.mockReturnValue(layout)

      element.willUpdate(changed(property))

      expect(mocks.layoutFamilyTree).toHaveBeenCalledOnce()
      expect(element._layout).toBe(layout)
    }
  )
})
