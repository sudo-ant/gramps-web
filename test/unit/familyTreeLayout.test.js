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

const visibleBounds = node => ({
  left:
    node.x -
    familyTreeLayoutDefaults.boxWidth / 2 -
    familyTreeLayoutDefaults.sexStripExtent,
  right: node.x + familyTreeLayoutDefaults.boxWidth / 2,
  top: node.y - familyTreeLayoutDefaults.boxHeight / 2,
  bottom: node.y + familyTreeLayoutDefaults.boxHeight / 2,
})

const expectNoCardOverlaps = layout => {
  layout.nodes.forEach((node, index) => {
    const first = visibleBounds(node)
    layout.nodes.slice(index + 1).forEach(other => {
      const second = visibleBounds(other)
      const overlaps =
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top
      expect(overlaps, `${node.handle} overlaps ${other.handle}`).toBe(false)
    })
  })
}

const expectGenerationBands = layout => {
  const byGeneration = Map.groupBy(layout.nodes, node => node.generation)
  byGeneration.forEach(nodes => {
    expect(new Set(nodes.map(node => node.y))).toHaveLength(1)
  })
}

const expectChildrenCentred = (layout, relationship) => {
  const children = layout.links
    .filter(link => link.relationship === relationship)
    .map(link => link.target)
  expect(children.length).toBeGreaterThan(0)
  expect(
    (Math.min(...children.map(child => child.x)) +
      Math.max(...children.map(child => child.x))) /
      2
  ).toBe(relationship.x)
}

const ancestryPeople = depth => {
  const people = []
  const build = (handle, remaining) => {
    if (remaining === 0) {
      people.push(person(handle))
      return
    }
    const father = `${handle}F`
    const mother = `${handle}M`
    const parents = family(`F_${handle}`, father, mother, [handle])
    people.push(person(handle, {parentFamily: parents}))
    build(father, remaining - 1)
    build(mother, remaining - 1)
  }
  build('R', depth)
  return people
}

const segmentIntersects = (start, end, bounds) => {
  if (start.x === end.x) {
    return (
      start.x > bounds.left &&
      start.x < bounds.right &&
      Math.max(start.y, end.y) > bounds.top &&
      Math.min(start.y, end.y) < bounds.bottom
    )
  }
  return (
    start.y > bounds.top &&
    start.y < bounds.bottom &&
    Math.max(start.x, end.x) > bounds.left &&
    Math.min(start.x, end.x) < bounds.right
  )
}

describe('layoutFamilyTree', () => {
  it('places a focal person without relatives at the origin', () => {
    const layout = layoutFamilyTree(new FamilyGraph([person('R')]), 'R')

    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0]).toMatchObject({handle: 'R', x: 0, y: 0})
    expect(layout.relationships).toHaveLength(0)
  })

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

    expect(
      rightEdge - familyTreeLayoutDefaults.sexStripExtent - leftEdge
    ).toBeGreaterThanOrEqual(familyTreeLayoutDefaults.partnerGap)
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

  it('places every displayed generation on one card-centre axis', () => {
    const people = ancestryPeople(3)
    const root = people.find(item => item.handle === 'R')
    const focalFamily = family('FD', 'R', 'P', ['C'])
    root.extended.families = [focalFamily]
    people.push(person('P'), person('C', {parentFamily: focalFamily}))

    const layout = layoutFamilyTree(new FamilyGraph(people), 'R', {
      ancestorDepth: 3,
      descendantDepth: 1,
    })

    expectGenerationBands(layout)
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

  it('flanks the focal person with two partners', () => {
    const firstFamily = family('F1', 'R', 'P1', [])
    const secondFamily = family('F2', 'R', 'P2', [])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const x = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node.x])
    )

    expect(x.P1).toBeLessThan(x.R)
    expect(x.P2).toBeGreaterThan(x.R)
    expect(Math.abs(x.P1)).toBe(Math.abs(x.P2))
    expectNoCardOverlaps(layout)
  })

  it('keeps two partnerships and their children on relationship anchors', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1', 'C2'])
    const secondFamily = family('F2', 'R', 'P2', ['C3'])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const root = layout.nodes.find(node => node.handle === 'R')
    const partners = ['P1', 'P2'].map(handle =>
      layout.nodes.find(node => node.handle === handle)
    )
    const relationships = ['F1', 'F2'].map(handle =>
      layout.relationships.find(item => item.family.handle === handle)
    )

    expect(partners[0].x).toBeLessThan(root.x)
    expect(partners[1].x).toBeGreaterThan(root.x)
    expect(new Set([root, ...partners].map(node => node.y))).toHaveLength(1)
    relationships.forEach((relationship, index) => {
      expect(relationship.y).toBe(root.y)
      expect(relationship.routeLane).toBe(0)
      expect(relationship.x).toBe((root.x + partners[index].x) / 2)
      expectChildrenCentred(layout, relationship)
    })
  })

  it('widens two couples instead of moving children off their relationships', () => {
    const makeGraph = wide => {
      const firstFamily = family('F1', 'R', 'P1', ['C1'])
      const secondFamily = family('F2', 'R', 'P2', ['C2'])
      const firstChildFamily = family(
        'FC1',
        'C1',
        '',
        wide ? ['G1', 'G2', 'G3', 'G4'] : ['G1']
      )
      const secondChildFamily = family('FC2', 'C2', '', ['G5'])
      return new FamilyGraph([
        person('R', {families: [firstFamily, secondFamily]}),
        person('P1'),
        person('P2'),
        person('C1', {
          parentFamily: firstFamily,
          families: [firstChildFamily],
        }),
        person('C2', {
          parentFamily: secondFamily,
          families: [secondChildFamily],
        }),
        ...['G1', 'G2', 'G3', 'G4'].map(handle =>
          person(handle, {parentFamily: firstChildFamily})
        ),
        person('G5', {parentFamily: secondChildFamily}),
      ])
    }
    const narrow = layoutFamilyTree(makeGraph(false), 'R', {
      descendantDepth: 2,
    })
    const wide = layoutFamilyTree(makeGraph(true), 'R', {
      descendantDepth: 2,
    })
    const partnerSpan = layout => {
      const partners = layout.nodes.filter(node =>
        ['P1', 'P2'].includes(node.handle)
      )
      return (
        Math.max(...partners.map(node => node.x)) -
        Math.min(...partners.map(node => node.x))
      )
    }

    expect(partnerSpan(wide)).toBeGreaterThan(partnerSpan(narrow))
    wide.relationships
      .filter(item => ['F1', 'F2'].includes(item.family.handle))
      .forEach(relationship => {
        expect(relationship.routeLane).toBe(0)
        expectChildrenCentred(wide, relationship)
      })
    expectNoCardOverlaps(wide)
  })

  it('places later partners progressively outward with distinct routes', () => {
    const families = ['P1', 'P2', 'P3', 'P4'].map((partner, index) =>
      family(`F${index + 1}`, 'R', partner, [])
    )
    const graph = new FamilyGraph([
      person('R', {families}),
      ...families.map(item => person(item.mother_handle)),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const x = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node.x])
    )
    const outer = layout.relationships.filter(item => item.routeLane)

    expect(x.P3).toBeLessThan(x.P1)
    expect(x.P4).toBeGreaterThan(x.P2)
    expect(outer.map(item => item.routeLane)).toEqual([1, 2])
    expect(outer.every(item => item.coupleRoute.length === 2)).toBe(true)
    expectNoCardOverlaps(layout)
  })

  it('packs each descendant family around its own children', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1', 'C2'])
    const secondFamily = family('F2', 'R', 'P2', ['C3'])
    const childFamily1 = family('FC1', 'C1', 'CP1', ['G1'])
    const childFamily2 = family('FC2', 'C1', 'CP2', ['G2'])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
      person('C1', {
        parentFamily: firstFamily,
        families: [childFamily1, childFamily2],
      }),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
      person('CP1'),
      person('CP2'),
      person('G1', {parentFamily: childFamily1}),
      person('G2', {parentFamily: childFamily2}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})
    const first = layout.relationships.find(item => item.family.handle === 'F1')
    const second = layout.relationships.find(
      item => item.family.handle === 'F2'
    )
    const linkedTo = relationship =>
      layout.links
        .filter(link => link.relationship === relationship)
        .map(link => link.target.handle)

    expect(linkedTo(first)).toEqual(['C1', 'C2'])
    expect(linkedTo(second)).toEqual(['C3'])
    expectNoCardOverlaps(layout)
  })

  it('keeps a descendant with two partners on one relationship axis', () => {
    const focalFamily = family('FR', 'R', 'RP', ['A'])
    const firstFamily = family('FA1', 'A', 'AP1', ['C1', 'C2'])
    const secondFamily = family('FA2', 'A', 'AP2', ['C3'])
    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('RP'),
      person('A', {
        parentFamily: focalFamily,
        families: [firstFamily, secondFamily],
      }),
      person('AP1'),
      person('AP2'),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})
    const shared = layout.nodes.find(node => node.handle === 'A')
    const partners = ['AP1', 'AP2'].map(handle =>
      layout.nodes.find(node => node.handle === handle)
    )
    const relationships = layout.relationships.filter(item =>
      ['FA1', 'FA2'].includes(item.family.handle)
    )

    expect(new Set([shared, ...partners].map(node => node.y))).toHaveLength(1)
    relationships.forEach(relationship => {
      expect(relationship.y).toBe(shared.y)
      expect(relationship.routeLane).toBe(0)
      expect(relationship.x).toBe((shared.x + relationship.partner.x) / 2)
      expectChildrenCentred(layout, relationship)
    })
    expectNoCardOverlaps(layout)
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

  it('packs four balanced ancestor generations without card overlaps', () => {
    const layout = layoutFamilyTree(new FamilyGraph(ancestryPeople(4)), 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })

    expect(layout.nodes.filter(node => node.generation === 4)).toHaveLength(16)
    expect(layout.bounds.xMax - layout.bounds.xMin).toBeLessThan(3600)
    expectNoCardOverlaps(layout)
  })

  it('keeps the first ancestor couple compact in an unbalanced tree', () => {
    const fatherParents = family('FF', 'FF1', 'FM1', ['F'])
    const fatherGrandparents = family('FG', 'FGF', 'FGM', ['FF1'])
    const fatherGreatGrandparents = family('FGG', 'GGF', 'GGM', ['FGF'])
    const rootParents = family('FR', 'F', 'M', ['R'])
    const graph = new FamilyGraph([
      person('R', {parentFamily: rootParents}),
      person('F', {parentFamily: fatherParents}),
      person('M'),
      person('FF1', {parentFamily: fatherGrandparents}),
      person('FM1'),
      person('FGF', {parentFamily: fatherGreatGrandparents}),
      person('FGM'),
      person('GGF'),
      person('GGM'),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })
    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    expect(mother.x - father.x).toBe(
      familyTreeLayoutDefaults.boxWidth +
        familyTreeLayoutDefaults.sexStripExtent +
        familyTreeLayoutDefaults.partnerGap
    )
    expect(layout.bounds.xMax - layout.bounds.xMin).toBeLessThan(800)
    expectNoCardOverlaps(layout)
  })

  it('uses the visible sex-strip footprint when separating cards', () => {
    const firstFamily = family('F1', 'R', 'P1', [])
    const secondFamily = family('F2', 'R', 'P2', [])
    const layout = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [firstFamily, secondFamily]}),
        person('P1'),
        person('P2'),
      ]),
      'R',
      {descendantDepth: 1}
    )
    const root = visibleBounds(layout.nodes.find(node => node.handle === 'R'))
    const right = visibleBounds(layout.nodes.find(node => node.handle === 'P2'))

    expect(right.left - root.right).toBe(familyTreeLayoutDefaults.partnerGap)
  })

  it('keeps junctions and routed connector corridors outside unrelated cards', () => {
    const families = ['P1', 'P2', 'P3', 'P4'].map((partner, index) =>
      family(`F${index + 1}`, 'R', partner, [`C${index + 1}`])
    )
    const graph = new FamilyGraph([
      person('R', {families}),
      ...families.flatMap((item, index) => [
        person(item.mother_handle),
        person(`C${index + 1}`, {parentFamily: item}),
      ]),
    ])
    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    layout.relationships.forEach(relationship => {
      layout.nodes.forEach(node => {
        const bounds = visibleBounds(node)
        expect(
          relationship.x > bounds.left &&
            relationship.x < bounds.right &&
            relationship.y > bounds.top &&
            relationship.y < bounds.bottom,
          `${relationship.key} junction intersects ${node.handle}`
        ).toBe(false)
      })
      relationship.coupleRoute.forEach(route => {
        route.slice(1).forEach((point, index) => {
          layout.nodes
            .filter(
              node =>
                node !== relationship.person && node !== relationship.partner
            )
            .forEach(node => {
              expect(
                segmentIntersects(route[index], point, visibleBounds(node)),
                `${relationship.key} route intersects ${node.handle}`
              ).toBe(false)
            })
        })
      })
    })
  })

  it('returns deterministic coordinates and bounds containing all geometry', () => {
    const people = ancestryPeople(3)
    const graph = new FamilyGraph(people)
    const first = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 3,
      descendantDepth: 0,
    })
    const second = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 3,
      descendantDepth: 0,
    })
    const coordinates = layout => ({
      nodes: layout.nodes.map(({key, x, y}) => ({key, x, y})),
      relationships: layout.relationships.map(({key, x, y}) => ({key, x, y})),
      bounds: layout.bounds,
    })

    expect(coordinates(second)).toEqual(coordinates(first))
    first.nodes.forEach(node => {
      const bounds = visibleBounds(node)
      expect(bounds.left).toBeGreaterThanOrEqual(first.bounds.xMin)
      expect(bounds.right).toBeLessThanOrEqual(first.bounds.xMax)
      expect(bounds.top).toBeGreaterThanOrEqual(first.bounds.yMin)
      expect(bounds.bottom).toBeLessThanOrEqual(first.bounds.yMax)
    })
    first.relationships.forEach(relationship => {
      expect(relationship.x).toBeGreaterThanOrEqual(first.bounds.xMin)
      expect(relationship.x).toBeLessThanOrEqual(first.bounds.xMax)
      expect(relationship.y).toBeGreaterThanOrEqual(first.bounds.yMin)
      expect(relationship.y).toBeLessThanOrEqual(first.bounds.yMax)
      relationship.coupleRoute.flat().forEach(point => {
        expect(point.x).toBeGreaterThanOrEqual(first.bounds.xMin)
        expect(point.x).toBeLessThanOrEqual(first.bounds.xMax)
        expect(point.y).toBeGreaterThanOrEqual(first.bounds.yMin)
        expect(point.y).toBeLessThanOrEqual(first.bounds.yMax)
      })
    })
  })

  it('keeps focal descendant coordinates independent of ancestor complexity', () => {
    const focalFamily = family('FD', 'R', 'P', ['C1', 'C2'])
    const descendantPeople = [
      person('P'),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ]
    const simple = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [focalFamily]}),
        ...descendantPeople,
      ]),
      'R',
      {ancestorDepth: 0, descendantDepth: 1}
    )
    const ancestors = ancestryPeople(4)
    ancestors.find(item => item.handle === 'R').extended.families = [
      focalFamily,
    ]
    const complex = layoutFamilyTree(
      new FamilyGraph([...ancestors, ...descendantPeople]),
      'R',
      {ancestorDepth: 4, descendantDepth: 1}
    )
    const descendants = layout =>
      Object.fromEntries(
        layout.nodes
          .filter(node => node.generation <= 0)
          .map(node => [node.handle, {x: node.x, y: node.y}])
      )

    expect(descendants(complex)).toEqual(descendants(simple))
  })

  it('keeps ancestor coordinates independent of descendant complexity', () => {
    const ancestors = ancestryPeople(4)
    const simple = layoutFamilyTree(new FamilyGraph(ancestors), 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })
    const firstFamily = family('FD1', 'R', 'P1', ['C1', 'C2', 'C3'])
    const secondFamily = family('FD2', 'R', 'P2', ['C4', 'C5'])
    ancestors.find(item => item.handle === 'R').extended.families = [
      firstFamily,
      secondFamily,
    ]
    const complex = layoutFamilyTree(
      new FamilyGraph([
        ...ancestors,
        person('P1'),
        person('P2'),
        ...['C1', 'C2', 'C3'].map(handle =>
          person(handle, {parentFamily: firstFamily})
        ),
        ...['C4', 'C5'].map(handle =>
          person(handle, {parentFamily: secondFamily})
        ),
      ]),
      'R',
      {ancestorDepth: 4, descendantDepth: 1}
    )
    const ancestryCoordinates = layout =>
      Object.fromEntries(
        layout.nodes
          .filter(node => node.generation > 0)
          .map(node => [node.handle, {x: node.x, y: node.y}])
      )

    expect(ancestryCoordinates(complex)).toEqual(ancestryCoordinates(simple))
  })

  it("lays out an ancestor's additional partnerships without collateral expansion", () => {
    const primary = family('FGV', 'G', 'H', ['V'])
    const firstSide = family('FG1', 'G', 'P1', ['S1'])
    const secondSide = family('FG2', 'G', 'P2', ['S2'])
    const partnerParents = family('FPP', 'PF', 'PM', ['P1'])
    const graph = new FamilyGraph([
      person('V', {parentFamily: primary}),
      person('G', {families: [primary, firstSide, secondSide]}),
      person('H', {families: [primary]}),
      person('P1', {parentFamily: partnerParents, families: [firstSide]}),
      person('P2', {families: [secondSide]}),
      person('S1', {parentFamily: firstSide}),
      person('S2', {parentFamily: secondSide}),
      person('PF'),
      person('PM'),
    ])

    const layout = layoutFamilyTree(graph, 'V', {
      ancestorDepth: 2,
      descendantDepth: 0,
    })
    const handles = layout.nodes.map(node => node.handle)
    const relationships = Object.fromEntries(
      layout.relationships.map(relationship => [
        relationship.family.handle,
        relationship,
      ])
    )

    expect(handles.filter(handle => handle === 'G')).toHaveLength(1)
    expect(handles.filter(handle => handle === 'V')).toHaveLength(1)
    expect(handles).toEqual(expect.arrayContaining(['G', 'H', 'P1', 'P2']))
    expect(handles).not.toEqual(
      expect.arrayContaining(['S1', 'S2', 'PF', 'PM'])
    )
    expect(Object.keys(relationships)).toEqual(
      expect.arrayContaining(['FGV', 'FG1', 'FG2'])
    )
    expect(relationships.FG1.partner.handle).toBe('P1')
    expect(relationships.FG2.partner.handle).toBe('P2')
    expect(
      layout.links
        .filter(link => link.relationship.family.handle === 'FGV')
        .map(link => link.target.handle)
    ).toEqual(['V'])
    expect(
      layout.links.filter(link =>
        ['FG1', 'FG2'].includes(link.relationship.family.handle)
      )
    ).toHaveLength(0)
    expectNoCardOverlaps(layout)
  })
})
