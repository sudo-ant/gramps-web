import {select} from 'd3-selection'
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
    expect(junctions).toHaveLength(layout.relationships.length)
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

    expect(Number(line.getAttribute('x1'))).toBe(
      relationship.person.x - relationship.x - (personDirection * 190) / 2
    )

    expect(Number(line.getAttribute('x2'))).toBe(
      relationship.partner.x - relationship.x - (partnerDirection * 190) / 2
    )
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
})
