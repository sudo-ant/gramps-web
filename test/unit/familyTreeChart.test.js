import {select} from 'd3-selection'
import {zoom, zoomIdentity, zoomTransform} from 'd3-zoom'
import {describe, expect, it} from 'vitest'
import {FamilyTreeChart} from '../../src/charts/FamilyTreeChart.js'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {layoutFamilyTree} from '../../src/charts/layout/familyTreeLayout.js'

const childRef = ref => ({
  ref,
  frel: 'Birth',
  mrel: 'Birth',
})

const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(childRef),
})

const person = (handle, {parentFamily = {}, families = []} = {}) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {
    gramps_id: `I_${handle}`,
    name_given: `Given${handle}`,
    name_surname: `Sur${handle}`,
    sex: 'U',
  },
  extended: {
    primary_parent_family: parentFamily,
    families,
  },
})

const parents = family('FP', 'F', 'M', ['R'])
const focalFamily = family('FR', 'R', 'P', ['C'])

const graph = new FamilyGraph([
  person('R', {
    parentFamily: parents,
    families: [focalFamily],
  }),
  person('F', {families: [parents]}),
  person('M', {families: [parents]}),
  person('P', {families: [focalFamily]}),
  person('C', {parentFamily: focalFamily}),
])

const size = {
  bboxWidth: 800,
  bboxHeight: 600,
}

const personNode = (chart, handle) =>
  [...chart.node.querySelectorAll('.family-tree-node')].find(
    node => !node.__data__.isRelationship && node.__data__.handle === handle
  )

const translateOf = node => {
  const [, x, y] = /translate\(([^,]+),([^)]+)\)/.exec(
    node.getAttribute('transform')
  )
  return [Number(x), Number(y)]
}

const viewPosition = (chart, handle) => {
  const [x, y] = zoomTransform(chart.node).apply(
    translateOf(personNode(chart, handle))
  )
  const [left, top] = chart.node.getAttribute('viewBox').split(',').map(Number)
  return [x - left, y - top]
}

const expectClose = (actual, expected) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]))

const setZoom = (chart, transform) =>
  select(chart.node).call(zoom().transform, transform)

describe('FamilyTreeChart', () => {
  it('draws person cards and invisible relationship nodes separately', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    const nodes = chart.node.querySelectorAll('.family-tree-node')
    const cards = chart.node.querySelectorAll('.person-card')
    const junctions = chart.node.querySelectorAll('.relationship-junction')

    expect(nodes).toHaveLength(
      layout.nodes.length + layout.relationships.length
    )
    expect(cards).toHaveLength(layout.nodes.length)
    expect(chart.node.querySelectorAll('.person-card rect')).toHaveLength(
      layout.nodes.length * 2
    )
    expect(chart.node.querySelectorAll('.person-card text')).toHaveLength(
      layout.nodes.length * 2
    )
    expect(junctions).toHaveLength(layout.relationships.length)
  })

  it('draws cards when referenced people were not fetched', () => {
    const chart = new FamilyTreeChart()
    const partialGraph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
    ])
    const layout = layoutFamilyTree(partialGraph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 1,
    })
    const unresolved = layout.nodes.filter(node => !node.person)

    expect(unresolved.length).toBeGreaterThan(0)
    expect(() =>
      chart.update(layout, {
        ...size,
        getImageUrl: node => (node.person ? 'image-url' : ''),
      })
    ).not.toThrow()
    expect(chart.node.querySelectorAll('.person-card')).toHaveLength(
      layout.nodes.length
    )
    expect(chart.node.querySelectorAll('.person-card rect')).toHaveLength(
      layout.nodes.length * 2
    )
  })

  it('uses portrait placeholders only when the caller enables them', () => {
    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 1,
    })
    const withPlaceholders = new FamilyTreeChart()
    withPlaceholders.update(layout, {
      ...size,
      showImagePlaceholder: true,
      getImageUrl: node => (node.handle === 'P' ? 'image-url' : ''),
    })

    expect(
      withPlaceholders.node.querySelectorAll('.person-card-avatar')
    ).toHaveLength(layout.nodes.length - 1)
    expect(
      [...withPlaceholders.node.querySelectorAll('.person-card')]
        .find(card => card.__data__.handle === 'P')
        .querySelector('.person-card-avatar')
    ).toBeNull()

    const unchangedDefault = new FamilyTreeChart()
    unchangedDefault.update(layout, size)
    expect(
      unchangedDefault.node.querySelector('.person-card-avatar')
    ).toBeNull()
  })

  it('draws a couple line for each relationship with two people', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    const expected = layout.relationships.filter(
      relationship => relationship.person && relationship.partner
    )

    expect(chart.node.querySelectorAll('.relationship-couple')).toHaveLength(
      expected.length
    )
  })

  it('draws couple lines only between the edges of partner cards', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    const relationship = layout.relationships.find(
      item => item.person.handle === 'R' && item.partner?.handle === 'P'
    )

    const relationshipNode = [
      ...chart.node.querySelectorAll('.family-tree-node'),
    ].find(
      node =>
        node.__data__.isRelationship &&
        node.__data__.family.handle === relationship.family.handle
    )

    const line = relationshipNode.querySelector('.relationship-couple')

    const personDirection = Math.sign(relationship.person.x - relationship.x)
    const partnerDirection = Math.sign(relationship.partner.x - relationship.x)
    const edge = (person, direction) =>
      person.x - relationship.x - (direction > 0 ? 190 / 2 + 4 : -190 / 2)

    expect(Number(line.getAttribute('x1'))).toBe(
      edge(relationship.person, personDirection)
    )

    expect(Number(line.getAttribute('x2'))).toBe(
      edge(relationship.partner, partnerDirection)
    )
  })

  it('draws routed multi-partner connectors through their assigned lanes', () => {
    const families = ['P1', 'P2', 'P3'].map((partner, index) =>
      family(`FM${index}`, 'R', partner, [])
    )
    const multiPartnerGraph = new FamilyGraph([
      person('R', {families}),
      ...families.map(item => person(item.mother_handle)),
    ])
    const layout = layoutFamilyTree(multiPartnerGraph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 1,
    })
    const chart = new FamilyTreeChart()

    chart.update(layout, size)

    const routed = layout.relationships.filter(item => item.routeLane)
    const paths = chart.node.querySelectorAll('.relationship-couple-route')
    expect(paths).toHaveLength(routed.length)
    expect(
      [...paths].every(path => /^M.*L.*L/.test(path.getAttribute('d')))
    ).toBe(true)
  })

  it('keeps ordinary two-partner couple lines on the card axis', () => {
    const families = ['P1', 'P2'].map((partner, index) =>
      family(`FT${index}`, 'R', partner, [`C${index}`])
    )
    const twoPartnerGraph = new FamilyGraph([
      person('R', {families}),
      ...families.flatMap((item, index) => [
        person(item.mother_handle),
        person(`C${index}`, {parentFamily: item}),
      ]),
    ])
    const layout = layoutFamilyTree(twoPartnerGraph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 1,
    })
    const chart = new FamilyTreeChart()

    chart.update(layout, size)

    expect(layout.relationships.every(item => item.routeLane === 0)).toBe(true)
    expect(
      chart.node.querySelectorAll('line.relationship-couple')
    ).toHaveLength(2)
    expect(
      chart.node.querySelectorAll('.relationship-couple-route')
    ).toHaveLength(0)
    expect(
      [...chart.node.querySelectorAll('line.relationship-couple')].every(
        line =>
          line.getAttribute('y1') === '0' && line.getAttribute('y2') === '0'
      )
    ).toBe(true)
  })

  it('draws relationship-to-child links', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    expect(
      chart.node.querySelectorAll('#chart-content > g:first-of-type path')
    ).toHaveLength(layout.links.length)
  })

  it('starts child links at the relationship junction', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 1,
    })

    const treeLink = layout.links.find(
      item =>
        item.relationship.person.handle === 'R' && item.target.handle === 'C'
    )

    const relationship = treeLink.relationship
    const target = treeLink.target

    const path = chart.linkPath([
      [relationship.x, relationship.y],
      [target.x, target.y],
    ])

    expect(path).toMatch(
      new RegExp(`^M${relationship.x},${relationship.y}(?:C|$)`)
    )
  })

  it('does not treat relationship junctions as person cards', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    const relationshipNodes = [
      ...chart.node.querySelectorAll('.family-tree-node'),
    ].filter(node => node.__data__.isRelationship)

    expect(relationshipNodes.length).toBeGreaterThan(0)

    relationshipNodes.forEach(node => {
      expect(node.querySelector('.person-card')).toBeNull()
    })
  })

  it('supports relationship links during an animated update', () => {
    const chart = new FamilyTreeChart()

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })

    chart.update(layout, size)

    expect(() => {
      chart.update(layout, {
        ...size,
        duration: 1000,
      })
    }).not.toThrow()

    select(chart.node).selectAll('*').interrupt().interrupt('fade')
  })

  it('removes links whose relationships are absent from the next layout', () => {
    const chart = new FamilyTreeChart()
    const first = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })
    const nextFamily = family('FX', 'X', 'XP', ['XC'])
    const next = layoutFamilyTree(
      new FamilyGraph([
        person('X', {families: [nextFamily]}),
        person('XP', {families: [nextFamily]}),
        person('XC', {parentFamily: nextFamily}),
      ]),
      'X',
      {ancestorDepth: 0, descendantDepth: 1}
    )

    chart.update(first, size)
    expect(() => chart.update(next, size)).not.toThrow()

    expect(chart.node.querySelectorAll('.link')).toHaveLength(next.links.length)
    expect(chart.node.querySelectorAll('.person-card')).toHaveLength(
      next.nodes.length
    )
    expect(personNode(chart, 'X')).not.toBeUndefined()
    expect(personNode(chart, 'R')).toBeUndefined()
  })

  it('keeps a clicked new focal person at the same screen position and zoom', () => {
    const childFamily = family('FC', 'C', 'CP', ['GC'])
    const recenterGraph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily, families: [childFamily]}),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])
    const chart = new FamilyTreeChart()
    chart.update(
      layoutFamilyTree(recenterGraph, 'R', {
        ancestorDepth: 0,
        descendantDepth: 1,
      }),
      size
    )
    setZoom(chart, zoomIdentity.translate(45, 25).scale(1.75))
    const child = personNode(chart, 'C')
    const before = viewPosition(chart, 'C')
    child.dispatchEvent(new MouseEvent('click', {bubbles: true}))

    chart.update(
      layoutFamilyTree(recenterGraph, 'C', {
        ancestorDepth: 0,
        descendantDepth: 1,
      }),
      size
    )

    expect(personNode(chart, 'C')).toBe(child)
    expectClose(viewPosition(chart, 'C'), before)
    expect(zoomTransform(chart.node).k).toBeCloseTo(1.75)
    expect(personNode(chart, 'CP')).not.toBeUndefined()
    expect(personNode(chart, 'GC')).not.toBeUndefined()
    expect(personNode(chart, 'R')).toBeUndefined()
  })
})
