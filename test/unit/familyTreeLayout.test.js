import {describe, expect, it} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  familyTreeLayoutDefaults,
  layoutFamilyTree,
} from '../../src/charts/layout/familyTreeLayout.js'

const childRef = ref => ({ref, frel: 'Birth', mrel: 'Birth'})

const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(childRef),
})

const person = (handle, {parentFamily = {}, families = []} = {}) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {gramps_id: `I_${handle}`, sex: 'U'},
  extended: {
    primary_parent_family: parentFamily,
    families,
  },
})

describe('layoutFamilyTree', () => {
  it('places the focal person and partner on the same generation', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const partner = layout.nodes.find(node => node.handle === 'P')

    expect(root.y).toBe(0)
    expect(partner.y).toBe(root.y)
    expect(root.generation).toBe(0)
    expect(partner.generation).toBe(0)

    const left = root.x < partner.x ? root : partner
    const right = root.x < partner.x ? partner : root

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2
    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(rightEdge - leftEdge).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.partnerGap
    )
  })

  it('places the relationship between the focal person and partner', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const partner = layout.nodes.find(node => node.handle === 'P')
    const relationship = layout.relationships[0]

    expect(relationship.x).toBe((root.x + partner.x) / 2)
    expect(relationship.y).toBe(root.y)
  })

  it('places children below their parents and links them to the relationship', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const children = layout.nodes.filter(node =>
      ['C1', 'C2'].includes(node.handle)
    )

    expect(children).toHaveLength(2)
    expect(children.every(node => node.y > root.y)).toBe(true)
    expect(children.every(node => node.generation === -1)).toBe(true)

    expect(layout.links).toHaveLength(2)
    expect(
      layout.links.every(link => link.source === layout.relationships[0])
    ).toBe(true)
    expect(layout.links.map(link => link.target.handle).sort()).toEqual([
      'C1',
      'C2',
    ])
  })

  it('centres siblings around the relationship', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const relationship = layout.relationships[0]
    const children = layout.nodes
      .filter(node => ['C1', 'C2'].includes(node.handle))
      .sort((a, b) => a.x - b.x)

    expect((children[0].x + children[1].x) / 2).toBe(relationship.x)
  })

  it('supports a family with no known partner', () => {
    const focalFamily = family('F1', 'R', '', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.nodes.map(node => node.handle).sort()).toEqual(['C', 'R'])
    expect(layout.relationships).toHaveLength(1)
    expect(layout.relationships[0].partner).toBeUndefined()
    expect(layout.relationships[0].x).toBe(0)
  })

  it('includes bounds around all displayed people', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThan(layout.bounds.xMin)
      expect(node.x).toBeLessThan(layout.bounds.xMax)
      expect(node.y).toBeGreaterThan(layout.bounds.yMin)
      expect(node.y).toBeLessThan(layout.bounds.yMax)
    }
  })
  it('keeps multiple partners as separate relationships', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1'])
    const secondFamily = family('F2', 'R', 'P2', ['C2'])

    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1', {families: [firstFamily]}),
      person('P2', {families: [secondFamily]}),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.relationships).toHaveLength(2)

    const first = layout.relationships.find(
      relationship => relationship.family.handle === 'F1'
    )
    const second = layout.relationships.find(
      relationship => relationship.family.handle === 'F2'
    )

    expect(first.partner.handle).toBe('P1')
    expect(second.partner.handle).toBe('P2')

    const firstChildren = layout.links
      .filter(link => link.relationship === first)
      .map(link => link.target.handle)

    const secondChildren = layout.links
      .filter(link => link.relationship === second)
      .map(link => link.target.handle)

    expect(firstChildren).toEqual(['C1'])
    expect(secondChildren).toEqual(['C2'])
  })

  it('places different focal partnerships without overlapping partner cards', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1'])
    const secondFamily = family('F2', 'R', 'P2', ['C2'])

    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1', {families: [firstFamily]}),
      person('P2', {families: [secondFamily]}),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const firstPartner = layout.nodes.find(node => node.handle === 'P1')
    const secondPartner = layout.nodes.find(node => node.handle === 'P2')

    expect(firstPartner.x).not.toBe(secondPartner.x)

    const left = firstPartner.x < secondPartner.x ? firstPartner : secondPartner
    const right =
      firstPartner.x < secondPartner.x ? secondPartner : firstPartner

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2
    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(rightEdge - leftEdge).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.familyGap
    )
    expect(firstPartner.y).toBe(0)
    expect(secondPartner.y).toBe(0)
  })

  it('expands a descendant relationship when descendant depth allows it', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const childFamily = family('F2', 'C', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})

    expect(layout.nodes.some(node => node.handle === 'CP')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'GC')).toBe(true)

    const childRelationship = layout.relationships.find(
      relationship => relationship.family.handle === 'F2'
    )

    expect(childRelationship).toBeDefined()
    expect(childRelationship.person.handle).toBe('C')
    expect(childRelationship.partner.handle).toBe('CP')

    const grandchild = layout.nodes.find(node => node.handle === 'GC')

    expect(grandchild.generation).toBe(-2)
  })

  it('does not expand descendant relationships beyond the requested depth', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const childFamily = family('F2', 'C', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.nodes.some(node => node.handle === 'C')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'CP')).toBe(false)
    expect(layout.nodes.some(node => node.handle === 'GC')).toBe(false)
    expect(
      layout.relationships.some(
        relationship => relationship.family.handle === 'F2'
      )
    ).toBe(false)
  })
  it('keeps a descendant partner clear of the descendant sibling branch', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])
    const childFamily = family('F2', 'C1', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('C2', {parentFamily: focalFamily}),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})

    const child = layout.nodes.find(node => node.handle === 'C1')
    const childPartner = layout.nodes.find(node => node.handle === 'CP')
    const sibling = layout.nodes.find(node => node.handle === 'C2')

    const occupiedRight =
      Math.max(child.x, childPartner.x) + familyTreeLayoutDefaults.boxWidth / 2

    const siblingLeft = sibling.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(siblingLeft - occupiedRight).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.siblingGap
    )
  })

  it('places the focal person parents above the focal person', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    expect(father.generation).toBe(1)
    expect(mother.generation).toBe(1)
    expect(father.y).toBeLessThan(root.y)
    expect(mother.y).toBeLessThan(root.y)
  })

  it('places an ancestor relationship between the two parent cards', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    const relationship = layout.relationships.find(
      item => item.family.handle === 'FP'
    )

    expect(relationship).toBeDefined()
    expect(relationship.x).toBe((father.x + mother.x) / 2)
    expect(relationship.y).toBe(father.y)
  })

  it('expands primary ancestry recursively', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {
        parentFamily: grandparents,
        families: [parents],
      }),
      person('M', {families: [parents]}),
      person('GF', {families: [grandparents]}),
      person('GM', {families: [grandparents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 2,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const grandfather = layout.nodes.find(node => node.handle === 'GF')
    const grandmother = layout.nodes.find(node => node.handle === 'GM')

    expect(father.generation).toBe(1)
    expect(grandfather.generation).toBe(2)
    expect(grandmother.generation).toBe(2)

    expect(grandfather.y).toBeLessThan(father.y)
    expect(father.y).toBeLessThan(root.y)
  })

  it('does not expand ancestry beyond the requested depth', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {
        parentFamily: grandparents,
        families: [parents],
      }),
      person('M', {families: [parents]}),
      person('GF', {families: [grandparents]}),
      person('GM', {families: [grandparents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    expect(layout.nodes.some(node => node.handle === 'F')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'M')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'GF')).toBe(false)
    expect(layout.nodes.some(node => node.handle === 'GM')).toBe(false)
  })
  it('supports ancestry with only one known parent', () => {
    const parents = family('FP', 'F', '', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const relationship = layout.relationships.find(
      item => item.family.handle === 'FP'
    )

    expect(father).toBeDefined()
    expect(father.generation).toBe(1)
    expect(father.y).toBeLessThan(root.y)
    expect(relationship).toBeDefined()
    expect(relationship.x).toBe(father.x)
  })

  it('keeps an ancestral couple separated by the partner gap', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    const left = father.x < mother.x ? father : mother
    const right = father.x < mother.x ? mother : father

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2

    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(rightEdge - leftEdge).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.partnerGap
    )
  })
})
